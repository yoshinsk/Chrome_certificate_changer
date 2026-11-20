// lab/addon-tab.mjs | 通常版 Chrome の実際の拡張ボタンから、同じタブの起動とサーバーが返した指紋の表示を試す。
import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";
import {loadUnpacked} from "./load-unpacked.mjs";
import {session} from "./protocol.mjs";

const [spec, operation] = process.argv.slice(2);
const data = JSON.parse(await readFile(spec, "utf8"));
const root = path.join(process.env.LOCALAPPDATA, "ChromeCertificateChanger", "profiles");
assert.equal(path.dirname(path.resolve(data.profile)), root);
assert.match(path.basename(data.profile), /^[a-f0-9-]{36}$/);
const [port, route] = (await readFile(path.join(data.profile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/);
assert.match(port, /^\d+$/);
assert.match(route, /^\/devtools\/browser\/[\w-]+$/);
const endpoint = "http://127.0.0.1:" + port;
const extensionId = "aeieeneijdcmhecnfpddppnnlgbkopaj";
const panelUrl = "chrome-extension://" + extensionId + "/panel.html";

/** 通常版のツールバーから開いたポップアップなど、今回起動したブラウザーの指定文書だけを操作する。 */
async function evaluate(tab, expression) {
  const result = await session(tab.webSocketDebuggerUrl, port, send =>
    send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true}));
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

/** Popup はページ以外の種類として現れることもあるため、拡張 ID と URL で特定する。 */
async function waitPanel() {
  for (let i = 0; i < 55; i++) {
    const pages = await (await fetch(endpoint + "/json/list")).json();
    const found = pages.find(page => page.url === panelUrl);
    if (found && await evaluate(found, "Boolean(document.getElementById('entries')?.options.length)")) return found;
    await delay(120);
  }
  throw new Error("通常版のツールバーから開いた拡張画面が見つかりません。");
}

/** 登録試験のためのタブは閉じ、銀行を模したページ1枚で切替と確認を試す。 */
async function prepare() {
  const settings = await loadUnpacked(port, data.pid, extensionId, data.extension);
  const tab = await (await fetch(endpoint + "/json/new?" + encodeURIComponent(panelUrl + "?tab"), {method: "PUT"})).json();
  try {
    for (let i = 0; i < 40 && !await evaluate(tab, "Boolean(chrome.storage?.local)"); i++) await delay(120);
    const values = Object.fromEntries(data.entries.map(entry => ["entry:" + entry.id, entry]));
    await evaluate(tab, "chrome.storage.local.set(" + JSON.stringify(values) + ")");
  } finally {
    for (const id of [tab.id, settings]) await fetch(endpoint + "/json/close/" + id);
  }
}

/** 製品のクリック処理を通す。銀行の選択予定を B にしても実際の A が画面の答えになることを確認する。 */
async function exercise(args) {
  const el = id => document.getElementById(id);
  const entry = args.entry;
  el("entries").value = entry.id;
  el("entries").dispatchEvent(new Event("change"));
  if (args.operation === "open-b") {
    if (!el("sameTabHelp").textContent.includes("異なる証明書")) throw new Error("同じ銀行の注意表示がありません。");
    el("openHere").click();
    return;
  }
  el("inspect").click();
  for (let i = 0; i < 80; i++) {
    const text = el("tabStatus").textContent;
    if (text.includes("\n")) {
      if (args.operation === "unknown") {
        if (!text.includes("このページでは接続先から証明書の指紋を確認できません") || text.includes(args.hash)) throw new Error(text);
      } else {
        if (!text.includes("接続先が通知した証明書") || !text.includes(args.hash) ||
            !text.includes("一致する登録　" + args.company) || text.includes("選択中の登録とは異なる") !== (args.operation === "check-b")) throw new Error(text);
      }
      if (args.operation === "check-b") {
        el("manualMatch").open = true;
        el("reportedHash").value = entry.certificate.fingerprint;
        el("compareHash").click();
        for (let j = 0; j < 30 && !el("matchResult").textContent; j++) await new Promise(r => setTimeout(r, 60));
        if (!el("matchResult").textContent.includes("一致する登録　" + entry.company) || el("tabStatus").textContent !== text) {
          throw new Error("手入力の照合と自動確認が区別されていません。");
        }
      }
      return text;
    }
    const notice = el("notice").textContent;
    if (notice) throw new Error(notice);
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("表示を確認できません。");
}

if (operation === "prepare") {
  await prepare();
} else {
  const active = (await (await fetch(endpoint + "/json/list")).json()).find(page => page.id === data.tab);
  assert.ok(active && ["localhost", "127.0.0.1"].includes(new URL(active.url).hostname));
  await session(active.webSocketDebuggerUrl, port, send => send("Page.bringToFront"));
  const powershell = path.join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe");
  const helper = fileURLToPath(new URL("./browser-button.ps1", import.meta.url));
  for (const button of ["Extensions", "Action"]) {
    await promisify(execFile)(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", helper,
      "-BrowserPid", String(data.pid), "-Profile", data.profile, "-Operation", button], {timeout: 16000});
  }
  const popup = await waitPanel();
  const number = operation === "elsewhere" ? 2 : operation === "check-a" ? 0 : 1;
  const actual = data.entries[operation === "elsewhere" ? 2 : 0];
  const args = {entry: data.entries[number], hash: actual.certificate.fingerprint, company: actual.company, operation};
  await evaluate(popup, "(" + exercise.toString() + ")(" + JSON.stringify(args) + ")");
  if (operation === "open-b") {
    for (let i = 0; i < 65; i++) {
      const tabs = await (await fetch(endpoint + "/json/list")).json();
      if (tabs.find(page => page.id === data.tab)?.url === data.entries[1].url) break;
      if (i === 64) throw new Error("同じタブで銀行を開けませんでした。");
      await delay(100);
    }
  }
  const tabs = await (await fetch(endpoint + "/json/list")).json();
  assert.deepEqual(tabs.filter(page => page.type === "page" && page.id !== popup.id).map(page => page.id), [data.tab]);
  if (tabs.some(page => page.id === popup.id)) await evaluate(popup, "setTimeout(() => window.close(), 0); true");
  console.log("Chrome 拡張ボタンの実測　" + operation);
}
