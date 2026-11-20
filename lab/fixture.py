# lab/fixture.py | 使い捨ての検証用証明書を発行し、Windows 個人ストアとループバックの検証サーバーを管理する。
import base64
import hashlib
import ipaddress
import json
import os
import queue
import secrets
import subprocess
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

HERE = Path(__file__).resolve().parent
POWERSHELL = str(Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe")
CASES = {"first": "A", "second": "B", "again": "A", "wrong": "A", "update": "A", "renewed": "A2", "panel": "A2"}


def issue(name, issuer=None, server=False, days=1, key=None):
    """発行者・用途・有効期間を限定する。更新後の A2 は A と同じ名義で新しく発行する。"""
    if key is None:
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)])
    now = datetime.now(timezone.utc)
    builder = (x509.CertificateBuilder().subject_name(subject)
               .issuer_name(issuer[0].subject if issuer else subject)
               .public_key(key.public_key()).serial_number(x509.random_serial_number())
               .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=days))
               .add_extension(x509.BasicConstraints(ca=issuer is None, path_length=0 if not issuer else None), True))
    if issuer:
        purpose = ExtendedKeyUsageOID.SERVER_AUTH if server else ExtendedKeyUsageOID.CLIENT_AUTH
        builder = builder.add_extension(x509.ExtendedKeyUsage([purpose]), False)
    if server:
        builder = builder.add_extension(x509.SubjectAlternativeName([
            x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), False)
    return builder.sign(issuer[1] if issuer else key, hashes.SHA256()), key


class Fixture:
    """秘密鍵は試験で新しく発行したものだけを扱う。一般の証明書をエクスポートしない。"""

    def __init__(self, directory, reuse_renewal_key=False):
        self.directory = Path(directory)
        self.tag = secrets.token_hex(6)
        self.issuer = "CCC Lab " + self.tag
        self.events = queue.Queue()
        self.installed = []
        self.process = None
        ca = issue(self.issuer, days=3)
        server, server_key = issue("CCC Loopback", ca, server=True)
        self.clients = {name: issue("CCC-" + name + "-" + self.tag, ca) for name in ("A", "B")}
        # Windows 側の判別試験では、名義だけでなく鍵も同じまま更新するケースを作る。
        renewal_key = self.clients["A"][1] if reuse_renewal_key else None
        self.clients["A2"] = issue("CCC-A-" + self.tag, ca, days=2, key=renewal_key)
        self.fingerprints = {key: cert.fingerprint(hashes.SHA256()).hex().upper()
                             for key, (cert, _) in self.clients.items()}
        self.server_fingerprint = server.fingerprint(hashes.SHA256()).hex().upper()
        spki = server.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
        self.pin = base64.b64encode(hashlib.sha256(spki).digest()).decode("ascii")
        self.config = self.directory / "fixture.json"
        self.config.write_text(json.dumps({
            "serverCert": server.public_bytes(serialization.Encoding.PEM).decode(),
            "serverKey": server_key.private_bytes(serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode(),
            "ca": ca[0].public_bytes(serialization.Encoding.PEM).decode(),
            "identities": self.fingerprints, "cases": CASES,
        }), encoding="utf-8")

    def start(self):
        """サーバーの待受を確認してから A と B の試験用証明書を用意する。"""
        self.process = subprocess.Popen(["node", str(HERE / "server.mjs"), str(self.config)],
                                        stdout=subprocess.PIPE, text=True, encoding="utf-8")
        threading.Thread(target=self._read_events, daemon=True).start()
        self.port = self.events.get(timeout=15)["port"]
        self.config.unlink()
        self.install("A")
        self.install("B")

    def _read_events(self):
        """サーバーの標準出力を試験側の待ち行列に渡し、各要求の応答待ちに期限を設ける。"""
        for line in self.process.stdout:
            self.events.put(json.loads(line))

    def _store(self, identity, operation, path=None, password=None):
        """現在の試験の発行者と指紋を指定し、他の Windows 証明書を操作対象から外す。"""
        cert = self.clients[identity][0]
        args = [POWERSHELL, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                "-File", str(HERE / "store.ps1"), "-Operation", operation, "-IssuerName", self.issuer,
                "-Thumbprint", cert.fingerprint(hashes.SHA1()).hex().upper(), "-Fingerprint", self.fingerprints[identity]]
        if path:
            args.extend(["-PfxPath", str(path)])
        # PowerShell 7 から実行しても、Windows PowerShell が自分の証明書モジュールを読み込めるようにする。
        environment = {name: value for name, value in os.environ.items() if name.upper() != "PSMODULEPATH"}
        subprocess.run(args, input=(password or "") + "\n", text=True, check=True, timeout=25, env=environment)

    def install(self, identity):
        """既存証明書と更新後の証明書を、拡張機能の外から通常の個人ストアに登録する。"""
        cert, key = self.clients[identity]
        password = secrets.token_urlsafe(24)
        path = self.directory / (identity + ".pfx")
        path.write_bytes(pkcs12.serialize_key_and_certificates(None, key, cert, None,
                         serialization.BestAvailableEncryption(password.encode())))
        self.installed.append(identity)
        try:
            self._store(identity, "Add", path, password)
        finally:
            path.unlink(missing_ok=True)

    def close(self):
        """試験サーバーと、この実行が作った証明書・鍵の後始末を行う。失敗は呼び出し元に伝える。"""
        if self.process:
            self.process.terminate()
            self.process.wait(timeout=10)
            self.process.stdout.close()
        failures = []
        for identity in reversed(self.installed):
            try:
                self._store(identity, "Remove")
            except (OSError, subprocess.SubprocessError) as error:
                failures.append(str(error))
        if failures:
            raise RuntimeError("検証用証明書の撤去に失敗しました。 " + " ".join(failures))
