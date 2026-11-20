# lab/same-tab.py | 同じタブでの Chrome の再利用と Edge の再選択を、サーバーの受信証明書で検証する。
import argparse
import json
import os
import subprocess
import tempfile
import uuid
from contextlib import ExitStack
from pathlib import Path

from fixture import Fixture, HERE, POWERSHELL
from run import LabProfile, choose


def visit(tool, tab, url, profile, cert=None):
    """同じタブを操作し、証明書の確定後も元のウィンドウ ID とタブ ID が保たれることを確かめる。"""
    with subprocess.Popen(tool + ["visit", tab["tab"], url], stdout=subprocess.PIPE) as navigation:
        try:
            if cert:
                choose(profile, cert)
            output, _ = navigation.communicate(timeout=30)
        finally:
            if navigation.poll() is None:
                navigation.kill()
        assert navigation.returncode == 0 and json.loads(output) == tab, url


def check_edge(fixture, profile, tool, tab):
    """Edge のサイト情報に表示された名義と、変更の前後に同じ認証先が受け取った証明書を別々に確かめる。"""
    url = f"https://localhost:{fixture.port}/tab-a"
    controls = [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / "browser-button.ps1"),
                "-BrowserPid", str(profile.browser_pid), "-Profile", str(profile.path), "-Operation"]
    visit(tool, tab, url, profile, fixture.clients["A"][0])
    for name in ("A", "B"):
        event = fixture.events.get(timeout=12)
        assert event["case"] == "tab-a" and not event["resumed"] and event["fingerprint"] == fixture.fingerprints[name]
        assert json.loads(subprocess.check_output(tool + ["current", tab["tab"], url], timeout=12)) == tab
        for operation in ("Site", "Choices"):
            subprocess.run(controls + [operation], check=True, timeout=15)
        cert = fixture.clients[name][0]
        subprocess.run(controls + ["ReadName", "-CommonName", cert.subject.rfc4514_string()[3:]], check=True, timeout=15)
        print(f"Edge / 同じ認証先・タブ・ウィンドウ / サイト情報の名義 {name} / サーバー受信 {name}", flush=True)
        if name == "A":
            for operation in ("ChangeCertificate", "Change"):
                subprocess.run(controls + [operation], check=True, timeout=15)
            choose(profile, fixture.clients["B"][0])


def prepare_extension(folder, fixture, profile, tab):
    """使い捨てのプロファイルに配布物を読み込み、試験で発行した証明書だけを登録する。"""
    entries = []
    for identity, host, case in (("A", "127.0.0.1", "tab-a"), ("B", "127.0.0.1", "tab-b"), ("B", "localhost", "tab-elsewhere")):
        cert = fixture.clients[identity][0]
        entries.append({"id": str(uuid.uuid4()), "company": identity + "社", "service": "検証銀行", "usage": "",
                        "url": f"https://{host}:{fixture.port}/{case}", "renewalUrl": "", "certificate": {
                            "name": cert.subject.rfc4514_string()[3:], "serial": format(cert.serial_number, "X"),
                            "from": cert.not_valid_before_utc.isoformat(), "to": cert.not_valid_after_utc.isoformat(),
                            "fingerprint": fixture.fingerprints[identity]}})
    spec = fixture.directory / "addon.json"
    spec.write_text(json.dumps({"profile": str(profile.path), "pid": profile.browser_pid, "tab": tab["tab"],
                    "extension": str(folder.resolve(strict=True)), "entries": entries}), encoding="utf-8")
    command = ["node", str(HERE / "addon-tab.mjs"), str(spec)]
    subprocess.run(command + ["prepare"], check=True, timeout=60)
    return command


def main():
    """銀行へ接続せず、試験用サーバーが受け取った公開証明書の指紋を独立に確認する。"""
    if not __debug__:
        raise SystemExit("試験では Python の最適化オプションを外してください。")
    parser = argparse.ArgumentParser(description=__doc__)
    options = parser.add_mutually_exclusive_group()
    options.add_argument("--edge", action="store_true", help="Edge 標準の証明書変更とサイト情報を試す")
    options.add_argument("--extension-folder", type=Path, help="通常版 Chrome で指定フォルダーの拡張機能も試す")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="ccc-same-tab-") as tmp, ExitStack() as cleanup:
        fixture = Fixture(tmp)
        cleanup.callback(fixture.close)
        fixture.start()
        profile = LabProfile()
        cleanup.callback(profile.close)
        edge = Path(os.environ["ProgramFiles(x86)"]) / "Microsoft/Edge/Application/msedge.exe"
        profile.start(fixture, ["--disable-features=Translate,msEdgeFirstRunExperience",
                               "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost"],
                      executable=edge if args.edge else None)
        tool = ["node", str(HERE / "tab-visit.mjs"), str(profile.path)]
        original = json.loads(subprocess.check_output(tool + ["first"], timeout=15))
        if args.edge:
            return check_edge(fixture, profile, tool, original)
        addon = prepare_extension(args.extension_folder, fixture, profile, original) if args.extension_folder else None
        for case, host, chosen, picker, marker in [
            ("tab-a", "127.0.0.1", "A", True, False),
            ("tab-b", "127.0.0.1", "A", False, True),
            ("tab-clear", "127.0.0.1", "A", False, True),
            ("tab-after", "127.0.0.1", "A", False, False),
            ("tab-elsewhere", "localhost", "B", True, False),
            ("tab-back", "127.0.0.1", "A", False, False),
        ]:
            url = f"https://{host}:{fixture.port}/{case}"
            if addon and case == "tab-b":
                subprocess.run(addon + ["open-b"], check=True, timeout=45)
                assert json.loads(subprocess.check_output(tool + ["current", original["tab"], url], timeout=12)) == original
            else:
                visit(tool, original, url, profile, fixture.clients[chosen][0] if picker else None)
            observed = fixture.events.get(timeout=10)
            assert observed["case"] == case and observed["fingerprint"] == fixture.fingerprints[chosen], observed
            assert not observed["resumed"] and observed["marker"] == marker, observed
            print(f"{case} / 同じウィンドウ・タブ / 受信 {chosen} / 試験 Cookie {marker}", flush=True)
            checks = {"tab-a": "check-a", "tab-b": "check-b", "tab-after": "unknown", "tab-elsewhere": "elsewhere"}
            if addon and case in checks:
                subprocess.run(addon + [checks[case]], check=True, timeout=45)


if __name__ == "__main__":
    main()
