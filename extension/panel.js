// extension/panel.js | 利用者の登録を端末内に保存し、Windows 補助アプリに一覧取得と起動を依頼する。
import {entryName, entryPrefix, loginUrl, registration, sameRegistration} from "./registration.mjs";

const element = id => document.getElementById(id);
const hostName = "jp.chrome_certificate_changer.host";
const formFields = ["company", "service", "usage", "url", "renewalUrl"];
let entries = [];
let certificates = [];
let editing = null;
let readVersion = 0;

/** 通信エラーを画面で伝える。登録済みの指紋を「実際に提示した証明書」と表示しない。 */
function message(value = "", error = false) {
  element("notice").textContent = value;
  element("notice").classList.toggle("error", error);
}

/** Native Messaging が使えない場合も登録画面から再試行できる。 */
async function native(request) {
  let result;
  try {
    result = await chrome.runtime.sendNativeMessage(hostName, request);
  } catch {
    throw new Error("Windows 補助アプリに接続できません。インストーラーをもう一度開いてください。");
  }
  if (!result?.ok) throw new Error(result?.error || "補助アプリから応答を取得できません。");
  return result;
}

/** 表示中の法人をIDで取り出す。登録の並べ替え後も同じ用途を指す。 */
function selectedEntry() {
  return entries.find(entry => entry.id === element("entries").value);
}

/** 登録情報は予定として表示し、古い接続結果を新しいウィンドウに引き継がない。 */
function showSelection() {
  const entry = selectedEntry();
  element("launch").disabled = element("edit").disabled = !entry;
  element("renewal").hidden = !entry;
  element("identity").textContent = entry
    ? `登録証明書　${entry.certificate.name}\nシリアル番号　${entry.certificate.serial || "未登録"}\n期限　${entry.certificate.to.slice(0, 10)} UTC` : "法人と利用する証明書を登録してください。";
}

/** 1件ごとに保存して別の登録の同時更新を保つ。登録一覧は保存先から読み直す。 */
async function loadEntries(preferredId) {
  const saved = await chrome.storage.local.get(null);
  entries = Object.entries(saved).filter(([key]) => key.startsWith(entryPrefix))
    .map(([, entry]) => entry).sort((a, b) => entryName(a).localeCompare(entryName(b), "ja"));
  element("entries").replaceChildren(...entries.map(entry => new Option(entryName(entry), entry.id)));
  if (entries.some(entry => entry.id === preferredId)) element("entries").value = preferredId;
  showSelection();
}

/** ストアにある候補の発行者・指紋を表示し、同じ名義の新旧証明書を判別できるようにする。 */
function showCertificate() {
  const cert = certificates.find(item => item.fingerprint === element("certificates").value);
  element("certificateDetail").textContent = cert
    ? `名義　${cert.subject}\n発行者　${cert.issuer}\nシリアル番号　${cert.serial}\n有効期間（UTC）　${cert.from.slice(0, 10)} ～ ${cert.to.slice(0, 10)}\nSHA-256　${cert.fingerprint}` : "";
}

/** 更新は利用者が決める。同名の新しい証明書や一覧の先頭を自動選択しない。 */
async function refreshCertificates(preferred) {
  const version = ++readVersion;
  certificates = [];
  element("certificates").replaceChildren(new Option("証明書を選択してください", ""));
  showCertificate();
  const result = await native({action: "list"});
  if (version !== readVersion) return;
  certificates = result.certificates;
  for (const cert of certificates) {
    const option = new Option(`${cert.name} ／ ${cert.to.slice(0, 10)} ／ ${cert.fingerprint.slice(-12)}`, cert.fingerprint);
    option.disabled = !(Date.parse(cert.from) <= Date.now() && Date.now() < Date.parse(cert.to));
    element("certificates").add(option);
  }
  if (certificates.some(cert => cert.fingerprint === preferred)) element("certificates").value = preferred;
  showCertificate();
  if (!certificates.length) message("この Windows ユーザーの個人ストアに、クライアント認証用の証明書が見つかりません。");
}

/** 編集対象を固定し、銀行の通常の手順で更新した証明書も毎回ストアから取得する。 */
async function edit(entry) {
  editing = entry;
  element("editor").hidden = false;
  element("formTitle").textContent = entry ? "登録・証明書の変更" : "新規登録";
  for (const key of formFields) element(key).value = entry?.[key] ?? "";
  message();
  await refreshCertificates(entry?.certificate.fingerprint);
}

/** 入力済みの登録だけを書き換え、更新時は銀行用のプロファイルを維持する。 */
async function save() {
  const button = element("save");
  if (button.disabled) return;
  const cert = certificates.find(item => item.fingerprint === element("certificates").value);
  const fields = Object.fromEntries(formFields.map(key => [key, element(key).value]));
  const previous = editing;
  const entry = registration(fields, cert, previous?.id);
  const key = entryPrefix + entry.id;
  button.disabled = true;
  try {
    // 同じ拡張機能の別タブから同じ登録を同時に更新しても、古い指紋で上書きしない。
    await navigator.locks.request(key, async () => {
      if (previous && !sameRegistration(previous, (await chrome.storage.local.get(key))[key])) {
        await loadEntries(entry.id);
        throw new Error("別の画面で変更されました。「登録・証明書を変更」から開き直してください。");
      }
      await chrome.storage.local.set({[key]: entry});
    });
    await loadEntries(entry.id);
    element("editor").hidden = true;
    message("保存しました。証明書を更新した場合は、銀行でログアウトし、この用途の専用ウィンドウをすべて閉じてから開き直してください。");
  } finally { button.disabled = false; }
}

/** 期限切れでも銀行の正規窓口を開ける。証明書の発行・更新は銀行の既存手順で行う。 */
async function openRenewal(inDedicatedProfile) {
  message();
  const entry = await currentEntry();
  if (!entry) return;
  const url = loginUrl(entry.renewalUrl || entry.url);
  if (inDedicatedProfile) await native({action: "renew", id: entry.id, url});
  else await chrome.tabs.create({url});
  message("銀行のページを開きました。更新後は「登録・証明書を変更」から新しい証明書を選んでください。");
}

/** 起動直前にも補助アプリが登録指紋をストアと照合する。銀行へのログイン操作は本人が行う。 */
async function launch() {
  element("launch").disabled = true;
  message();
  try {
    const entry = await currentEntry();
    if (!entry) return;
    await native({action: "open", id: entry.id, url: entry.url, fingerprint: entry.certificate.fingerprint});
    message(`${entryName(entry)} の起動を依頼しました。証明書を選ぶときは、上に表示したシリアル番号と照合してください。`);
  } finally {
    showSelection();
  }
}

/** 別のタブで更新した後に古い登録を起動しないよう、押した時点の保存内容を照合する。 */
async function currentEntry() {
  const displayed = selectedEntry();
  if (!displayed) return null;
  const key = entryPrefix + displayed.id;
  const saved = (await chrome.storage.local.get(key))[key];
  if (!sameRegistration(saved, displayed)) {
    await loadEntries(displayed.id);
    throw new Error("登録内容が変更されました。表示を確認してからもう一度開いてください。");
  }
  return saved;
}

/** ユーザー操作と初期読込みの両方で、例外を画面の状態欄へ伝える。 */
function report(task) {
  return (...args) => Promise.resolve().then(() => task(...args)).catch(error => message(error.message, true));
}
element("expand").hidden = location.search === "?tab";
element("entries").onchange = () => { element("editor").hidden = true; message(); showSelection(); };
element("edit").onclick = report(() => edit(selectedEntry()));
element("add").onclick = report(() => edit(null));
element("cancel").onclick = () => { ++readVersion; element("editor").hidden = true; message(); };
element("refresh").onclick = report(() => { message(); return refreshCertificates(element("certificates").value); });
element("certificates").onchange = showCertificate;
element("editor").onsubmit = event => { event.preventDefault(); report(save)(); };
element("launch").onclick = report(launch);
element("renewHere").onclick = report(() => openRenewal(false));
element("renewProfile").onclick = report(() => openRenewal(true));
report(async () => { await loadEntries(); if (!entries.length) await edit(null); })();
