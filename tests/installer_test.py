# tests/installer_test.py | 未導入の Windows ユーザーで、配布用 EXE の導入・上書き・削除と既存データの保持を検証する。
import json
import os
import shutil
import subprocess
import tempfile
import unittest
import uuid
import winreg
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = Path(os.environ["LOCALAPPDATA"]) / "ChromeCertificateChanger"
PACKAGE = ROOT / "dist/ChromeCertificateChanger-Setup.exe"
HOST_KEY = r"Software\Google\Chrome\NativeMessagingHosts\jp.chrome_certificate_changer.host"
APP_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\ChromeCertificateChanger"


def registry(path, field=""):
    """Windows 11 の64ビットの現在ユーザー用登録を読み取る。未登録の値は None で返す。"""
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as key:
            return winreg.QueryValueEx(key, field)[0]
    except FileNotFoundError:
        return None


class InstallerTest(unittest.TestCase):
    """既に配布版を利用している環境では、アンインストールを伴う試験を行わない。"""

    def test_install_upgrade_uninstall(self):
        if not PACKAGE.exists():
            self.skipTest("先に installer/Build.ps1 で配布用ファイルを作成してください。")
        if registry(APP_KEY, "DisplayName") or any((APP / name).exists() for name in (
                "program", "program-next", "program-previous", "Uninstall.exe")):
            self.skipTest("既存の配布版を保護するため、未導入のユーザーで実行してください。")
        previous = registry(HOST_KEY)
        program = APP / "program"
        profile = APP / "profiles" / str(uuid.uuid4())
        profile.mkdir(parents=True, exist_ok=False)
        self.addCleanup(profile.rmdir)
        marker = profile / "installer-test.txt"
        marker.write_text("維持する検証データ", encoding="utf-8")
        self.addCleanup(marker.unlink, missing_ok=True)
        with tempfile.TemporaryDirectory(prefix="ccc-uninstall-") as directory:
            try:
                for _ in range(2):
                    subprocess.run([PACKAGE, "/S"], check=True, timeout=40)
                    host_manifest = program / "host/host.json"
                    self.assertEqual(registry(HOST_KEY), str(host_manifest))
                    manifest = json.loads(host_manifest.read_text(encoding="utf-8"))
                    self.assertTrue((host_manifest.parent / manifest["path"]).is_file())
                    self.assertTrue((program / "Guide.exe").is_file())
                    # 配布用 EXE だけを受け取った場合も、著作権表示とライセンス全文を参照できる。
                    self.assertEqual((program / "LICENSE.txt").read_bytes(), (ROOT / "LICENSE").read_bytes())
                    self.assertGreater((program / "NSIS-COPYING.txt").stat().st_size, 0)
                    extension = (program / "extension")
                    sources = {p.name: p.read_bytes() for p in (ROOT / "extension").iterdir() if p.is_file()}
                    self.assertEqual({p.name: p.read_bytes() for p in extension.iterdir()}, sources)
                    extension_manifest = json.loads(sources["manifest.json"])
                    self.assertEqual(registry(APP_KEY, "DisplayVersion"),
                                     extension_manifest.get("version_name", extension_manifest["version"]))
                    self.assertEqual(marker.read_text(encoding="utf-8"), "維持する検証データ")
                    self.assertFalse((APP / "program-previous").exists())
            finally:
                # 独立したコピーから削除して完了を待つ。試験中に導入した製品にだけこの操作を許可する。
                if (APP / "Uninstall.exe").is_file():
                    runner = Path(directory) / "remove.exe"
                    shutil.copyfile(APP / "Uninstall.exe", runner)
                    # NSIS は末尾の _?= 以降を空白込みのパスと解釈する。シェルを通さずそのまま渡す。
                    subprocess.run(subprocess.list2cmdline([str(runner), "/S"]) + " _?=" + str(APP),
                                   check=True, timeout=40)
            self.assertFalse(program.exists())
            self.assertFalse((APP / "Uninstall.exe").exists())
            self.assertIsNone(registry(APP_KEY, "DisplayName"))
            self.assertEqual(registry(HOST_KEY), previous)
            self.assertTrue(marker.is_file())


if __name__ == "__main__":
    unittest.main()
