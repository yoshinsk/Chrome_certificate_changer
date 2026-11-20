// lab/panel-test.mjs | 新しい Chrome プロファイルで初回導入、法人の登録・更新、補助アプリ経由の起動を確認する。
import assert from "node:assert/strict";
import {once} from "node:events";
import {mkdtemp, readFile, realpath, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {fileURLToPath} from "node:url";
import {session} from "./protocol.mjs";
import {loadUnpacked} from "./load-unpacked.mjs";

const [browser, fixturePath] = process.argv.slice(2);
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const parent = await realpath(os.tmpdir());
const profile = await mkdtemp(path.join(parent, "ccc-panel-"));
// 配布版の試験では、インストーラーが配置した拡張機能をそのまま読み込む。
const extension = process.argv[4] || fileURLToPath(new URL("../extension/", import.meta.url)).replace(/[\\/]$/, "");
const boot = process.argv[4] ? ["--force-renderer-accessibility", "about:blank"]
  : ["--headless", "--load-extension=" + extension, "about:blank"];
const child = spawn(browser, ["--user-data-dir=" + profile, "--no-first-run", "--no-default-browser-check",
  "--disable-background-networking", "--remote-debugging-port=0", ...boot],
  {stdio: "ignore", windowsHide: true});
const closed = once(child, "exit");
const extensionId = "aeieeneijdcmhecnfpddppnnlgbkopaj";

/** 拡張機能の本物の画面と Native Messaging を操作し、合成証明書を用いた登録だけを検査する。 */
async function exercise(data) {
  const el = id => document.getElementById(id);
  async function until(check) {
    for (let i = 0; i < 80; i++) {
      if (check()) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("画面の待機に失敗しました。 " + (el("notice")?.textContent || ""));
  }
  await until(() => typeof chrome.storage?.local !== "undefined" && el("editor"));
  await until(() => [...el("certificates").options].some(o => o.value === data.a));
  el("company").value = "試験法人";
  el("service").value = "検証銀行";
  el("usage").value = "経理";
  el("url").value = data.url;
  el("renewalUrl").value = data.updateUrl;
  el("certificates").value = data.a;
  el("save").click();
  await until(() => el("editor").hidden && !el("edit").disabled && el("notice").textContent.includes("保存しました"));
  const key = Object.keys(await chrome.storage.local.get(null)).find(k => k.startsWith("entry:"));
  const before = (await chrome.storage.local.get(key))[key];
  el("edit").click();
  await until(() => !el("editor").hidden && el("certificates").value === data.a);
  el("refresh").click();
  await new Promise(resolve => setTimeout(resolve, 100));
  await until(() => !el("editor").hidden && el("certificates").value === data.a);
  el("certificates").value = data.a2;
  el("save").click();
  await until(() => el("editor").hidden);
  const after = (await chrome.storage.local.get(key))[key];
  if (before.id !== after.id || before.certificate.fingerprint !== data.a || after.certificate.fingerprint !== data.a2)
    throw new Error("既存登録に対する証明書の更新を確認できません。");
  // 先に準備した合成サーバー専用プロファイルを使い、起動要求を同じサーバーの受信記録と照合する。
  await chrome.storage.local.remove(key);
  await chrome.storage.local.set({["entry:" + data.profileId]: {...after, id: data.profileId}});
  return true;
}

let browserSocket;
let debugPort;
try {
  let active;
  for (let i = 0; i < 80 && !active; i++) {
    if (child.exitCode !== null) throw new Error("試験用 Chrome の起動に失敗しました。");
    try {
      const contents = await readFile(path.join(profile, "DevToolsActivePort"), "utf8");
      if (/^\d+\r?\n\/devtools\/browser\/[\w-]+\s*$/.test(contents)) active = contents;
    } catch (error) {
      if (!["ENOENT", "EBUSY", "EPERM"].includes(error.code)) throw error;
    }
    if (!active) await delay(100);
  }
  if (!active) throw new Error("試験用 Chrome の接続先が見つかりません。");
  const [port, devPath] = active.trim().split(/\r?\n/);
  debugPort = port;
  const address = "127.0.0.1:" + port;
  browserSocket = "ws://" + address + devPath;
  if (process.argv[4]) await loadUnpacked(port, child.pid, extensionId);
  const page = "chrome-extension://" + extensionId + "/panel.html?tab";
  let tab;
  if (process.argv[4]) {
    // 配布ガイドと同じ URL を Chrome の起動引数で渡し、利用者が開く登録画面まで確かめる。
    const opener = spawn(browser, ["--user-data-dir=" + profile, page], {stdio: "ignore", windowsHide: true});
    await once(opener, "exit");
    for (let i = 0; i < 60 && !tab; i++) {
      const tabs = await (await fetch("http://" + address + "/json/list")).json();
      tab = tabs.find(item => item.type === "page" && item.url === page);
      if (!tab) await delay(100);
    }
    assert.ok(tab, "ガイドと同じ方法で法人の登録画面を開けませんでした。");
  } else {
    tab = await (await fetch("http://" + address + "/json/new?" + encodeURIComponent(page), {method: "PUT"})).json();
  }
  async function evaluate(expression) {
    const result = await session(tab.webSocketDebuggerUrl, port, send =>
      send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true}));
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  await delay(700);
  assert.equal(await evaluate("(" + exercise.toString() + ")(" + JSON.stringify(fixture) + ")"), true);
  await evaluate("location.reload()");
  await delay(700);
  assert.equal(await evaluate("document.getElementById('entries').value"), fixture.profileId);
  // 既存プロファイルでの更新経路を確認する。銀行のページを模した更新URLまでを対象にする。
  await evaluate("document.getElementById('renewal').open = true; document.getElementById('renewHere').click()");
  let renewalTab;
  for (let i = 0; i < 50 && !renewalTab; i++) {
    await delay(100);
    const targets = await (await fetch("http://" + address + "/json/list")).json();
    renewalTab = targets.find(item => item.type === "page" && item.url === fixture.updateUrl);
  }
  assert.ok(renewalTab, "現在の Chrome で公式更新URLを開けませんでした。");
  await fetch("http://" + address + "/json/close/" + renewalTab.id);
  await evaluate("document.getElementById('launch').click()");
  let launched = false;
  for (let i = 0; i < 70 && !launched; i++) {
    await delay(100);
    const notice = await evaluate("document.getElementById('notice').textContent");
    launched = notice.includes("起動を依頼しました");
    if (notice && !launched) throw new Error(notice);
  }
  assert.equal(launched, true);
  assert.equal(await evaluate("document.querySelector('.status').textContent"), "使用証明書は未確認");
  // 既存プロセスの再利用に加え、拡張から新しい Chrome が起動してホスト終了後も残るかを調べる。
  const cold = await evaluate("chrome.runtime.sendNativeMessage('jp.chrome_certificate_changer.host'," +
    JSON.stringify({action: "open", id: fixture.coldId, url: "https://127.0.0.1:1/", fingerprint: fixture.a2}) + ")");
  assert.equal(cold.ok, true);
  console.log("拡張画面の登録、再読込、同名更新、現在のプロファイルで更新窓口を開く操作、Native Messaging による起動を確認しました。");
} finally {
  if (browserSocket && child.exitCode === null) await session(browserSocket, debugPort, send => send("Browser.close")).catch(() => {});
  if (child.exitCode === null) {
    const timeout = setTimeout(() => child.kill(), 5000);
    try { await closed; } finally { clearTimeout(timeout); }
  }
  const owned = await realpath(profile);
  if (path.dirname(owned) !== parent || !path.basename(owned).startsWith("ccc-panel-")) throw new Error("撤去先が不正です。");
  await rm(owned, {recursive: true, force: true, maxRetries: 15, retryDelay: 180});
}
