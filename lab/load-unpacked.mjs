// lab/load-unpacked.mjs | 試験用 Chrome の拡張機能画面で、利用者と同じボタンとフォルダー選択を使って配布版を導入する。
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {setTimeout as delay} from "node:timers/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {session} from "./protocol.mjs";

/** 使い捨てプロファイルに表示された公開の設定画面だけを操作し、拡張機能のカードが現れるまで待つ。 */
export async function loadUnpacked(port, pid, extensionId) {
  const endpoint = "http://127.0.0.1:" + port;
  const page = await (await fetch(endpoint + "/json/new?" + encodeURIComponent("chrome://extensions/"), {method: "PUT"})).json();
  const toolbar = "document.querySelector('extensions-manager')?.shadowRoot?.querySelector('extensions-toolbar')?.shadowRoot";
  async function evaluate(expression) {
    const result = await session(page.webSocketDebuggerUrl, port, send =>
      send("Runtime.evaluate", {expression, userGesture: true, returnByValue: true}));
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  // 初期設定の読み込みが終わるまで待つ。すでにオンの場合にスイッチを押してオフにしない。
  let opened = false;
  for (let i = 0; i < 60 && !opened; i++) {
    opened = await evaluate("(() => { const bar=" + toolbar + "; const toggle=bar?.querySelector('#devMode');" +
      "if (!toggle?.matches(':defined') || toggle.disabled || typeof toggle.checked !== 'boolean') return false;" +
      "if (!toggle.checked) { toggle.click(); return false; } const button=bar.querySelector('#loadUnpacked');" +
      "if (!button?.matches(':defined') || button.hidden || !button.getBoundingClientRect().height) return false;" +
      "button.click(); return true; })()");
    if (!opened) await delay(250);
  }
  if (!opened) throw new Error("Chrome の拡張機能を読み込むボタンを押せませんでした。");
  const powershell = path.join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe");
  await promisify(execFile)(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    fileURLToPath(new URL("./select-folder.ps1", import.meta.url)), "-BrowserPid", String(pid)], {timeout: 22000});
  for (let i = 0; i < 80; i++) {
    if (await evaluate("Boolean(document.querySelector('extensions-manager')?.shadowRoot" +
        "?.querySelector('extensions-item-list')?.shadowRoot?.getElementById('" + extensionId + "'))")) {
      console.log("通常版 Chrome の追加画面で、配布版のフォルダーを選んで拡張機能を読み込みました。");
      return;
    }
    await delay(120);
  }
  throw new Error("追加した拡張機能のカードを確認できません。");
}
