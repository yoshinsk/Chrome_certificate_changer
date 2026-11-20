// extension/panel.js | 利用者の登録を端末内に保存し、Windows 補助アプリに一覧取得と起動を依頼する。
import {entryName, entryPrefix, loginUrl, registration, sameRegistration} from "./registration.mjs";
import {atBank, bankOrigin, matchFingerprint, normalizeFingerprint, readPageReceipt} from "./current-tab.mjs";

const element = id => document.getElementById(id);
const hostName = "jp.chrome_certificate_changer.host";
const formFields = ["company", "service", "usage", "url", "renewalUrl"];
let entries = [];
let certificates = [];
let editing = null;
let readVersion = 0;
let inspectionVersion = 0;
let inspectedTab = null;

/** タブの移動や法人の変更後に、過去の照合結果が残らないようにする。 */
function clearInspection() {
  inspectionVersion++;
  inspectedTab = null;
  element("tabStatus").textContent = "使用証明書は未確認";
  element("reportedHash").value = "";
  element("matchResult").textContent = "";
}

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
  clearInspection();
  element("openHere").disabled = element("launch").disabled = element("edit").disabled = !entry;
  element("manualMatch").hidden = !entry;
  element("renewal").hidden = !entry;
  const shared = entry && atBank(entries, bankOrigin(entry.url)).some(item => item.certificate.fingerprint !== entry.certificate.fingerprint);
  element("sameTabHelp").textContent = shared
    ? "このログイン先には異なる証明書が登録されています。このタブでは以前の証明書が再利用されます。法人を切り替えるときは専用ウィンドウを使ってください。"
    : "このタブのページを置き換えます。Chrome がすでに同じ認証先で選んだ証明書は再利用されます。";
  element("identity").textContent = entry
    ? `登録証明書　${entry.certificate.name}\nシリアル番号　${entry.certificate.serial || "未登録"}\n期限　${entry.certificate.to.slice(0, 10)} UTC` : "法人と利用する証明書を登録してください。";
}

/** 1件ごとに保存して別の登録の同時更新を保つ。登録一覧は保存先から読み直す。 */
async function savedEntries() {
  const saved = await chrome.storage.local.get(null);
  return Object.entries(saved).filter(([key]) => key.startsWith(entryPrefix))
    .map(([, entry]) => entry).sort((a, b) => entryName(a).localeCompare(entryName(b), "ja"));
}

/** 選択中の法人を保ちながら、最新の登録を画面に並べる。 */
async function loadEntries(preferredId) {
  entries = await savedEntries();
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

/** 押したウィンドウで表示中のタブを取得する。別のウィンドウは探さない。 */
async function activeTab() {
  const [tab] = await chrome.tabs.query({currentWindow: true, active: true});
  if (!Number.isInteger(tab?.id)) throw new Error("操作するタブを確認できません。");
  return tab;
}

/** このタブの URL だけを変更する。予定の証明書がまだ使えるか確認してから銀行へ移動する。 */
async function openHere() {
  message();
  element("openHere").disabled = true;
  try {
    const start = await activeTab();
    const entry = await currentEntry();
    if (!entry) return;
    const {certificates: available} = await native({action: "list"});
    const cert = available.find(item => item.fingerprint === entry.certificate.fingerprint);
    if (!cert || !(Date.parse(cert.from) <= Date.now() && Date.now() < Date.parse(cert.to))) {
      throw new Error("登録した証明書が見つからないか、有効期間外です。「登録・証明書を変更」で確かめてください。");
    }
    const target = await activeTab();
    if (start.id !== target.id || start.url !== target.url || !sameRegistration(entry, await currentEntry())) {
      throw new Error("表示中のタブか登録が変わりました。銀行を開くタブでもう一度操作してください。");
    }
    await chrome.tabs.update(target.id, {url: loginUrl(entry.url)});
  } finally { element("openHere").disabled = !selectedEntry(); }
}

/** 銀行のタブで明示的に押したときだけ、その文書が受け取った単一の指紋を読む。 */
async function inspectTab() {
  clearInspection();
  message();
  const version = inspectionVersion;
  const status = element("tabStatus");
  const tab = await activeTab();
  if (version !== inspectionVersion) return;
  inspectedTab = tab.id;
  const origin = bankOrigin(tab.url);
  const candidates = atBank(await savedEntries(), origin);
  if (version !== inspectionVersion) return;
  if (!candidates.length) {
    status.textContent += "\n登録した銀行のページで Chrome 右上の拡張機能から確認してください。認証中に別の接続先へ移った場合も、ここでは未確認です。";
    return;
  }
  // activeTab の一時許可を使う。参照先は登録した公式ログイン先のメイン文書に限る。
  let result;
  try {
    const query = {target: {tabId: tab.id}, func: readPageReceipt, args: [origin]};
    const [first] = await chrome.scripting.executeScript(query);
    if (first?.frameId === 0 && first.documentId && first.result) {
      // 同じ URL の再読み込みでも文書 ID は変わる。最初に読んだ文書が表示中の場合だけ結果を使う。
      const [again] = await chrome.scripting.executeScript({...query, target: {tabId: tab.id, documentIds: [first.documentId]}});
      if (again?.result?.hash === first.result.hash && again.result.at === first.result.at) result = again;
    }
  } catch { /* 移動中、アクセス制限、利用者が許可しなかった場合は未確認のまま案内する。 */ }
  const current = await activeTab();
  if (version !== inspectionVersion || current.id !== tab.id || current.url !== tab.url) return;
  const receipt = result?.frameId === 0 ? result.result : null;
  if (!receipt || !normalizeFingerprint(receipt.hash) || !Number.isFinite(receipt.at)) {
    status.textContent += "\nこのページでは接続先から証明書の指紋を確認できません。取引前に銀行の画面で法人名・利用者名を確認してください。";
    return;
  }
  const expected = candidates.find(item => item.id === selectedEntry()?.id);
  status.textContent = ["ページの読み込み時に接続先が通知した証明書", origin,
    new Date(receipt.at).toLocaleString("ja-JP"), matchFingerprint(receipt.hash, candidates, expected)].join("\n");
}

/** 手入力の結果は独立した欄に表示し、自動で取得した接続結果として扱わない。 */
async function compareInput() {
  const version = inspectionVersion;
  const entry = await currentEntry();
  const input = element("reportedHash").value;
  const hash = normalizeFingerprint(input);
  if (!entry || !hash) throw new Error("銀行画面の SHA-256 指紋を、64桁の英数字またはコロン区切りで入力してください。");
  const candidates = atBank(await savedEntries(), bankOrigin(entry.url));
  if (version !== inspectionVersion || input !== element("reportedHash").value) return;
  element("matchResult").textContent = "銀行画面から入力した指紋との照合\n" + matchFingerprint(hash, candidates, entry);
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
element("openHere").onclick = report(openHere);
element("inspect").onclick = report(inspectTab);
element("compareHash").onclick = report(compareInput);
element("reportedHash").oninput = () => { element("matchResult").textContent = ""; };
chrome.tabs.onActivated.addListener(clearInspection);
chrome.tabs.onUpdated.addListener((id, change) => {
  if (id === inspectedTab && (change.url || change.status === "loading")) clearInspection();
});
chrome.tabs.onRemoved.addListener(id => { if (id === inspectedTab) clearInspection(); });
chrome.tabs.onReplaced.addListener((added, removed) => { if (removed === inspectedTab) clearInspection(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some(key => key.startsWith(entryPrefix))) clearInspection();
});
element("renewHere").onclick = report(() => openRenewal(false));
element("renewProfile").onclick = report(() => openRenewal(true));
report(async () => { await loadEntries(); if (!entries.length) await edit(null); })();
