# lab/run.py | 実際の Chrome と補助アプリで A→B→A、誤選択、同名更新を試し、サーバー側の実測値と比較する。
import argparse
from contextlib import ExitStack
import json
import os
import shutil
import struct
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

from fixture import Fixture, HERE, POWERSHELL

ORIGIN = "chrome-extension://aeieeneijdcmhecnfpddppnnlgbkopaj/"
PROFILES = Path(os.environ["LOCALAPPDATA"]) / "ChromeCertificateChanger/profiles"


def native(binary, **message):
    """拡張機能と同じ Native Messaging の形式で、ビルドした実物に1要求を送る。"""
    body = json.dumps(message).encode()
    response = subprocess.run([str(binary), ORIGIN], input=struct.pack("<I", len(body)) + body,
                              capture_output=True, check=True, timeout=15).stdout
    if len(response) < 4 or len(response) != 4 + struct.unpack("<I", response[:4])[0]:
        raise ValueError("Native Messaging の応答長が不正です。")
    return json.loads(response[4:])


def chrome_path():
    """製品と同じローカルの Google Chrome を探す。外部ブラウザへの自動フォールバックはしない。"""
    for base in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
        candidate = Path(os.environ[base]) / "Google/Chrome/Application/chrome.exe"
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("Google Chrome が見つかりません。")


class LabProfile:
    """試験ごとに未使用の登録IDを発行する。普段の Chrome のプロセスやデータを操作しない。"""

    def __init__(self):
        self.id = str(uuid.uuid4())
        self.path = PROFILES / self.id
        PROFILES.mkdir(parents=True, exist_ok=True)
        self.path.mkdir(exist_ok=False)
        self.process = None

    def start(self, fixture, extra=()):
        """この合成サーバーの公開鍵だけを専用プロセスの試験用例外にし、Windows の信頼ストアを保つ。"""
        self.process = subprocess.Popen([str(chrome_path()), "--user-data-dir=" + str(self.path),
            "--no-first-run", "--no-default-browser-check", "--disable-background-mode",
            "--disable-background-networking", "--force-renderer-accessibility", "--lang=en-US",
            "--ignore-certificate-errors-spki-list=" + fixture.pin,
            "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", *extra, "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline and self.process.poll() is None:
            if (self.path / "DevToolsActivePort").is_file():
                return
            time.sleep(.15)
        raise TimeoutError("試験用 Chrome の起動を確認できません。")

    def stop(self):
        """自分が作った Chrome だけを PID 指定で終了し、子プロセスのプロファイル解放を待つ。"""
        if self.process and self.process.poll() is None:
            try:
                subprocess.run(["node", str(HERE / "browser-check.mjs"), str(self.path), "close"],
                               check=True, capture_output=True, timeout=8)
                self.process.wait(timeout=5)
            except (subprocess.SubprocessError, OSError):
                if self.process.poll() is None:
                    subprocess.run(["taskkill", "/pid", str(self.process.pid), "/t", "/f"], capture_output=True)
                    self.process.wait(timeout=10)
        (self.path / "DevToolsActivePort").unlink(missing_ok=True)

    def close(self):
        """初期化時に新規作成した直下の GUID ディレクトリだけを撤去する。"""
        self.stop()
        target = self.path.resolve()
        if target.parent != PROFILES.resolve() or target.name != self.id:
            raise ValueError("検証用プロファイルの撤去先を確認できません。")
        for attempt in range(15):
            try:
                shutil.rmtree(target)
                return
            except PermissionError:
                if attempt == 14:
                    raise
                time.sleep(.2)


def choose(profile, cert, manual=False, cancel=False):
    """この試験が発行した名義とシリアル番号を、指定した Chrome の選択画面で照合する。"""
    serial = format(cert.serial_number, "X")
    if manual:
        print("Chrome で選択してください。", cert.subject.rfc4514_string(), serial, flush=True)
        return
    command = [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / "picker.ps1"),
               "-BrowserPid", str(profile.process.pid), "-CommonName", cert.subject.rfc4514_string()[3:], "-Serial", serial]
    subprocess.run(command + (["-Cancel"] if cancel else []), check=True, timeout=30)


def test_run(binary, fixture, profiles, manual):
    """選択予定、ブラウザ側の独立判定、サーバーの受信証明書を別に観測する。"""
    def read_candidates():
        result = native(binary, action="list")
        assert result["ok"], result
        return {c["fingerprint"]: c for c in result["certificates"]}

    candidates = read_candidates()
    assert all(fixture.fingerprints[key] in candidates for key in ("A", "B"))
    assert fixture.fingerprints["A2"] not in candidates
    for profile in profiles.values():
        profile.start(fixture)
    for case, profile_key, wanted, chosen, pick in [
            ("first", "A", "A", "A", True), ("second", "B", "B", "B", True),
            ("again", "A", "A", "A", False), ("wrong", "wrong", "A", "B", True),
            ("update", "A", "A", "A", False),
            ("renewed", "A", "A2", "A2", True)]:
        profile = profiles[profile_key]
        if case == "renewed":
            # 旧証明書を残したまま通常の個人ストアに同名の新証明書を追加し、同じ登録IDを再利用する。
            fixture.install("A2")
            fresh = read_candidates()
            old, new = (fresh[fixture.fingerprints[key]] for key in ("A", "A2"))
            assert old["subject"] == new["subject"] and old["fingerprint"] != new["fingerprint"]
            profile.stop()
            profile.start(fixture)
        url = "https://127.0.0.1:{}/{}".format(fixture.port, case)
        print(f"{case}: 指定 {wanted} / 選択 {chosen}", flush=True)
        if case == "update":
            result = native(binary, action="renew", id=profile.id, url=url)
        else:
            result = native(binary, action="open", id=profile.id, url=url, fingerprint=fixture.fingerprints[wanted])
        assert result == {"ok": True, "evidence": "unknown"}, result
        if pick:
            choose(profile, fixture.clients[chosen][0], manual)
        observed = fixture.events.get(timeout=120 if manual else 15)
        assert observed["case"] == case and observed["actual"] == chosen, observed
        assert observed["fingerprint"] == fixture.fingerprints[chosen]
        assert observed["matches"] == (wanted == chosen)
        browser_cert = subprocess.check_output(["node", str(HERE / "browser-check.mjs"), str(profile.path),
                                               "certificate", url], text=True, timeout=15).strip()
        assert browser_cert == fixture.server_fingerprint, "Chrome の診断情報と検証サーバーの証明書を照合できません。"
        assert all(p.process.poll() is None for p in profiles.values())
        print(f"  サーバー受信 {chosen} / {'一致' if observed['matches'] else '不一致'} / Chrome の診断結果 サーバー証明書 / 拡張側は未確認", flush=True)


def main():
    """補助アプリを一時ビルドして検証する。途中で失敗した場合も試験用の資源を撤去する。"""
    if not __debug__:
        raise SystemExit("試験では Python の最適化オプションを外してください。")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manual", action="store_true", help="Chrome の証明書選択を手動で行う")
    parser.add_argument("--extension-browser", type=Path, help="拡張画面も検証する場合の Chrome for Testing 実行ファイル")
    parser.add_argument("--installed", action="store_true", help="Windows インストーラーで配置したファイルを検証する")
    args = parser.parse_args()
    if args.installed and not args.extension_browser:
        args.extension_browser = chrome_path()
    with tempfile.TemporaryDirectory(prefix="ccc-lab-") as directory, ExitStack() as cleanup:
        installed = PROFILES.parent / "program"
        binary = installed / "host/CertificateHost.exe" if args.installed else Path(directory) / "CertificateHost.exe"
        if not args.installed:
            subprocess.run([POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                            str(HERE.parent / "native/Install.ps1"), "-BuildOnly", "-OutputDirectory", directory], check=True)
        if not binary.is_file():
            raise FileNotFoundError("検証する Windows 補助アプリが見つかりません。")
        fixture = Fixture(directory)
        cleanup.callback(fixture.close)
        fixture.start()
        profiles = {}
        for label in ("A", "B", "wrong"):
            profiles[label] = LabProfile()
            cleanup.callback(profiles[label].close)
        test_run(binary, fixture, profiles, args.manual)
        if args.extension_browser:
            # 配布版は通常の Chrome の追加画面から導入し、開発版は Chrome for Testing に読み込む。
            base = "https://127.0.0.1:" + str(fixture.port)
            spec = Path(directory) / "panel.json"
            cold = LabProfile()
            cleanup.callback(cold.close)
            cold_check = [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                          str(HERE / "cold-window.ps1"), "-Id", cold.id]
            cleanup.callback(subprocess.run, cold_check + ["-CleanupOnly"], check=True, timeout=30)
            spec.write_text(json.dumps({"a": fixture.fingerprints["A"], "a2": fixture.fingerprints["A2"],
                            "url": base + "/panel", "updateUrl": base + "/update",
                            "profileId": profiles["A"].id, "coldId": cold.id}), encoding="utf-8")
            command = ["node", str(HERE / "panel-test.mjs"), str(args.extension_browser), str(spec)]
            subprocess.run(command + ([str(installed / "extension")] if args.installed else []), check=True, timeout=90)
            subprocess.run(cold_check, check=True, timeout=30)
            observed = fixture.events.get(timeout=15)
            assert observed["case"] == "panel" and observed["fingerprint"] == fixture.fingerprints["A2"]
        print("実銀行で提示した証明書の独立特定は未達です。", flush=True)


if __name__ == "__main__":
    main()
