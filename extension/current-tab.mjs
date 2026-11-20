// extension/current-tab.mjs | 同じタブで開く条件を確認し、表示中のページが通知した指紋を端末内の登録と照合する。
import {entryName, fingerprintPattern, loginUrl} from "./registration.mjs";

/** ログイン先のホストとポートを比較する。パスや標準ポートの表記だけでは別の認証先にならない。 */
export function bankOrigin(url) {
  try { return new URL(loginUrl(url)).origin; } catch { return null; }
}

/** 公式ログイン先が一致する登録だけを照合する。別の銀行にも登録された指紋を取り違えない。 */
export function atBank(entries, origin) {
  return origin ? entries.filter(entry => bankOrigin(entry.url) === origin) : [];
}

/** 銀行画面から写す指紋は、32バイトの16進数またはコロンで区切った32組だけを受け付ける。 */
export function normalizeFingerprint(value) {
  const text = String(value ?? "").trim().toUpperCase();
  if (fingerprintPattern.test(text)) return text;
  return /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(text) ? text.replaceAll(":", "") : null;
}

/** 同じ指紋を複数法人に登録した場合も全候補を表示し、証明書だけからログインした法人を決めない。 */
export function matchFingerprint(hash, entries, expected) {
  if (!fingerprintPattern.test(hash)) throw new Error("SHA-256 指紋の形式を確認してください。");
  const matches = entries.filter(entry => entry.certificate.fingerprint === hash);
  const lines = matches.length
    ? ["一致する登録　" + matches.map(entryName).join("、"), "シリアル番号　" + (matches[0].certificate.serial || "未登録")]
    : ["この接続先に一致する登録はありません。"];
  if (expected && expected.certificate.fingerprint !== hash) lines.push("選択中の登録とは異なる証明書です。");
  return [...lines, "SHA-256　" + hash].join("\n");
}

/** この関数は activeTab の許可で現在のメイン文書に送る。本文、Cookie、他の通信の内容を取り出さない。 */
export function readPageReceipt(origin) {
  if (window !== window.top || location.origin !== origin || document.visibilityState !== "visible" ||
      !window.isSecureContext || document.prerendering) return null;
  const nav = performance.getEntriesByType("navigation")[0];
  // 本文のない再検証応答やキャッシュ復元を除く。URL が変わった同一文書の履歴にも前の結果を付けない。
  if (!nav || !["navigate", "reload"].includes(nav.type) || nav.name.split("#")[0] !== location.href.split("#")[0] ||
      nav.responseStatus !== 200 || !nav.encodedBodySize || !(nav.transferSize > 300) || !nav.responseEnd || nav.workerStart ||
      nav.deliveryType || nav.activationStart || window.navigation?.activation?.navigationType === "traverse") return null;
  // この名前は対応サイトとの取り決め。対象の応答にある単一の指紋だけを受け取り、過去の結果で補わない。
  const items = nav.serverTiming?.filter(item => item.name === "mtls-client-cert-sha256") ?? [];
  if (items.length !== 1 || !/^[a-f0-9]{64}$/i.test(items[0].description)) return null;
  return {hash: items[0].description.toUpperCase(), at: performance.timeOrigin + nav.responseStart};
}
