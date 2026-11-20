// lab/tab-visit.mjs | 検証専用ブラウザーで同じタブを遷移させ、タブとウィンドウのIDが保たれたかを調べる。
import {readFile} from "node:fs/promises";
import path from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {session} from "./protocol.mjs";

const [folder, command, targetId, destination] = process.argv.slice(2);
const root = path.join(process.env.LOCALAPPDATA, "ChromeCertificateChanger", "profiles");
if (path.dirname(path.resolve(folder)) !== root || !/^[a-f0-9-]{36}$/.test(path.basename(folder))) {
  throw new Error("検証専用プロファイルを指定してください。");
}
const [port, browser] = (await readFile(path.join(folder, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/);
if (!/^\d+$/.test(port) || !/^\/devtools\/browser\/[\w-]+$/.test(browser)) throw new Error("検証接続先が不正です。");
const host = "127.0.0.1:" + port;
let tab;
for (let i = 0; i < 60 && !tab; i++) {
  const pages = await (await fetch("http://" + host + "/json/list")).json();
  tab = pages.find(t => t.type === "page" && (command === "first" ? t.url === "about:blank" : t.id === targetId));
  if (!tab) await delay(100);
}
if (!tab) throw new Error("対象のタブが見つかりません。");
if (command === "visit") {
  const url = new URL(destination);
  if (url.protocol !== "https:" || !["127.0.0.1", "localhost"].includes(url.hostname) || !url.port ||
      url.search || url.hash || url.username || url.password || !/^\/tab-[a-z]+$/.test(url.pathname)) {
    throw new Error("ループバックの試験 URL を指定してください。");
  }
  // navigate の完了後にフレーム自身の URL も確かめ、古い画面の結果を取り違えない。
  await session(tab.webSocketDebuggerUrl, port, async send => {
    const navigation = await send("Page.navigate", {url: url.href});
    if (navigation.errorText) throw new Error(navigation.errorText);
    for (let i = 0; i < 60; i++) {
      const {frameTree: {frame}} = await send("Page.getFrameTree");
      if (frame.url === url.href && !frame.unreachableUrl) return;
      await delay(100);
    }
    throw new Error("対象タブに試験ページが表示されません。");
  });
} else if (command === "current") {
  if (tab.url !== destination) throw new Error("元と同じタブに指定のページが表示されていません。");
} else if (command !== "first") {
  throw new Error("未対応の試験操作です。");
}
const window = await session("ws://" + host + browser, port, send => send("Browser.getWindowForTarget", {targetId: tab.id}));
console.log(JSON.stringify({tab: tab.id, window: window.windowId}));
