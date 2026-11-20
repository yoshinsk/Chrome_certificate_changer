# tests/host_test.py | Windows 補助アプリの実行ファイルに要求を送り、不正入力と使用できない証明書を確認する。
import json
import os
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "chrome-extension://aeieeneijdcmhecnfpddppnnlgbkopaj/"
ENTRY = "b079a344-dd6c-4b5d-b70b-65c111e5fee8"


class NativeHostTests(unittest.TestCase):
    """実ファイルを一時ビルドし、ブラウザの起動を伴わない要求の応答と終了状態を確認する。"""

    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix="ccc-host-tests-")
        cls.addClassCleanup(cls.directory.cleanup)
        shell = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
        subprocess.run([shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ROOT / "native/Install.ps1",
                       "-BuildOnly", "-OutputDirectory", cls.directory.name], check=True, capture_output=True)
        cls.binary = Path(cls.directory.name) / "CertificateHost.exe"

    def reply(self, payload):
        """応答フレームが余分な標準出力を含まず、宣言されたバイト数と一致することも検査する。"""
        data = subprocess.check_output([self.binary, ORIGIN], input=payload, timeout=8)
        self.assertEqual(struct.unpack("<I", data[:4])[0], len(data) - 4)
        return json.loads(data[4:])

    def send(self, message):
        """実際の拡張機能と同じ little-endian の長さと UTF-8 本文を送る。"""
        body = json.dumps(message).encode()
        return self.reply(struct.pack("<I", len(body)) + body)

    def test_origin(self):
        result = subprocess.run([self.binary, "chrome-extension://unknown/"], capture_output=True, timeout=8)
        self.assertEqual((result.returncode, result.stdout), (2, b""))

    def test_frame(self):
        for payload in [struct.pack("<I", 8) + b"{}", struct.pack("<I", 65536), b"\0\0\0\0"]:
            self.assertFalse(self.reply(payload)["ok"])

    def test_unsupported_operation(self):
        self.assertFalse(self.send({"action": "unrecognized"})["ok"])

    def test_registration_and_url(self):
        for action in ["open", "renew"]:
            for entry, url in [("../x", "https://127.0.0.1/"), (ENTRY, "http://127.0.0.1/"),
                               (ENTRY, "https://u:p@127.0.0.1/"), (ENTRY, 'https://127.0.0.1/"')]:
                self.assertFalse(self.send({"action": action, "id": entry, "url": url})["ok"])

    def test_missing_certificate(self):
        result = self.send({"action": "open", "id": ENTRY, "url": "https://127.0.0.1/", "fingerprint": "0" * 64})
        self.assertFalse(result["ok"])
        self.assertIn("登録証明書", result["error"])


if __name__ == "__main__":
    unittest.main()
