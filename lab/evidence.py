# lab/evidence.py | Windows 側の観測と、検証サーバーが受け取った証明書を独立に照合する。
import json
import queue
import socket
import subprocess
import tempfile
from contextlib import ExitStack
from pathlib import Path

from fixture import Fixture, HERE, POWERSHELL
from run import LabProfile, choose, native


def observe(directory, fixture, server_hash):
    """観測側へ渡す識別情報は検証サーバーと発行者だけ。選んだ証明書や受信結果は渡さない。"""
    command = [POWERSHELL, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
               str(HERE / "observe.ps1"), "-LabDirectory", str(directory), "-IssuerName", fixture.issuer,
               "-ServerFingerprint", server_hash]
    output = subprocess.check_output(command, text=True, timeout=20)
    return json.loads(output)


def trial(fixture, binary, identity, detailed, cancel=False):
    """新規の試験プロファイルで1件だけ開く。外部向けの通信は待受しない自前のポートへ向ける。"""
    with tempfile.TemporaryDirectory(prefix="ccc-evidence-") as temp, ExitStack() as cleanup:
        profile = LabProfile()
        blocked = cleanup.enter_context(socket.socket())
        blocked.bind(("127.0.0.1", 0))
        cleanup.callback(profile.close)
        flags = ["--proxy-server=http://127.0.0.1:" + str(blocked.getsockname()[1]),
                 "--proxy-bypass-list=<-loopback>;127.0.0.1:" + str(fixture.port),
                 "--disable-sync", "--disable-extensions", "--disable-quic",
                 "--log-net-log=" + str(Path(temp) / "loopback.json"),
                 "--net-log-capture-mode=" + ("Everything" if detailed else "Default")]
        profile.start(fixture, flags)
        # 毎回 A を登録した状態から始める。別名義 B や同名更新 A2 の判別を期待値から独立させる。
        url = "https://127.0.0.1:{}/wrong".format(fixture.port)
        result = native(binary, action="open", id=profile.id, url=url, fingerprint=fixture.fingerprints["A"])
        assert result == {"ok": True, "evidence": "unknown"}, result
        choose(profile, fixture.clients[identity][0], cancel=cancel)
        if cancel:
            # 選択行を確定せず取消した場合、検証ページを要求できなかったことを Chrome 側でも確認する。
            subprocess.run(["node", str(HERE / "browser-check.mjs"), str(profile.path), "error", url],
                           check=True, timeout=15)
        else:
            received = fixture.events.get(timeout=15)
            assert (received["case"], received["actual"], received["protocol"], received["resumed"]) == (
                "wrong", identity, "TLSv1.3", False), received
        profile.stop()
        local = observe(temp, fixture, fixture.server_fingerprint)
        wrong_peer = observe(temp, fixture, "0" * 64)
        assert wrong_peer["fingerprint"] is None and wrong_peer["peers"] == 0, wrong_peer
        if cancel:
            try:
                unexpected = fixture.events.get_nowait()
            except queue.Empty:
                pass
            else:
                raise AssertionError("取消後に検証ページが開きました。 " + str(unexpected))
            assert local["fingerprint"] is None, local
        else:
            assert local["peers"] > 0 and local["messages"] > 0, local
            expected = received["fingerprint"] if detailed else None
            assert local["fingerprint"] == expected, local
        print("診断 {} / 選択 {} / Windows 側 {} / サーバー {}".format(
            "詳細" if detailed else "標準", identity + ("で取消" if cancel else ""),
            identity if local["fingerprint"] else "未確認", "受信なし" if cancel else received["actual"]), flush=True)


def main():
    """試験が所有する証明書、プロファイル、診断ファイルを例外時にも撤去する。"""
    if not __debug__:
        raise SystemExit("試験では Python の最適化オプションを外してください。")
    with tempfile.TemporaryDirectory(prefix="ccc-probe-") as temp, ExitStack() as cleanup:
        subprocess.run([POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                        str(HERE.parent / "native/Install.ps1"), "-BuildOnly", "-OutputDirectory", temp], check=True)
        fixture = Fixture(temp, reuse_renewal_key=True)
        cleanup.callback(fixture.close)
        fixture.start()
        binary = Path(temp) / "CertificateHost.exe"
        trial(fixture, binary, "B", detailed=False)
        trial(fixture, binary, "B", detailed=True)
        fixture.install("A2")
        old, new = (fixture.clients[key][0] for key in ("A", "A2"))
        assert old.subject == new.subject and old.public_key() == new.public_key()
        assert fixture.fingerprints["A"] != fixture.fingerprints["A2"]
        trial(fixture, binary, "A", detailed=True)
        trial(fixture, binary, "A2", detailed=True)
        trial(fixture, binary, "B", detailed=True, cancel=True)


if __name__ == "__main__":
    main()
