// lab/browser-check.mjs | 試験用 Chrome のループバック接続の証明書を読み、試験終了時にその Chrome を閉じる。
import {X509Certificate} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {session} from "./protocol.mjs";

const [profile, operation, target] = process.argv.slice(2);
const base = path.join(process.env.LOCALAPPDATA, "ChromeCertificateChanger", "profiles");
if (path.dirname(path.resolve(profile)) !== base || !/^[a-f0-9-]{36}$/.test(path.basename(profile))) {
  throw new Error("試験プロファイルの指定が不正です。");
}
const [port, browserPath] = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/);
if (!/^\d+$/.test(port) || !/^\/devtools\/browser\/[\w-]+$/.test(browserPath)) throw new Error("試験接続先が不正です。");
const origin = "127.0.0.1:" + port;

if (operation === "close") {
  await session("ws://" + origin + browserPath, port, send => send("Browser.close"));
} else {
  const url = new URL(target);
  if (operation !== "certificate" || url.origin !== "https://127.0.0.1:" + url.port ||
      !/^\/(first|second|again|wrong|update|renewed)$/.test(url.pathname)) throw new Error("検証用のURLを指定してください。");
  let tab;
  for (let i = 0; i < 40 && !tab; i++) {
    const tabs = await (await fetch("http://" + origin + "/json/list")).json();
    tab = tabs.find(item => item.type === "page" && item.url === target);
    if (!tab) await delay(100);
  }
  if (!tab) throw new Error("検証用のタブが見つかりません。");
  // この診断 API が返す接続先証明書を比較する。ページ本文やサーバー側の照合結果は読まない。
  const {tableNames: chain} = await session(tab.webSocketDebuggerUrl, port, async send => {
    await send("Network.enable");
    // 同じ試験先に本文のない 204 を要求し、診断開始前のキャッシュだけを調べる事態を避ける。
    const probe = await send("Runtime.evaluate", {
      expression: "fetch('/probe', {cache:'no-store'}).then(r => r.status)", awaitPromise: true, returnByValue: true});
    if (probe.result?.value !== 204) throw new Error("検証用の接続を観測できません。");
    return send("Network.getCertificate", {origin: url.origin});
  });
  console.log(chain.length ? new X509Certificate(Buffer.from(chain[0], "base64")).fingerprint256.replaceAll(":", "") : "unknown");
}
