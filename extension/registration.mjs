// extension/registration.mjs | 登録情報を検証し、更新時に同じ用途のプロファイルを引き継ぐ。
export const entryPrefix = "entry:";
export const fingerprintPattern = /^[0-9A-F]{64}$/;

/** URL は Chrome の起動引数にも使う。認証情報と解釈が曖昧な文字を除く。 */
export function loginUrl(value) {
  const raw = String(value).trim();
  if (raw.length > 4096 || /[\s\x00-\x1f\x7f"\\]/u.test(raw) || !/^https:\/\//i.test(raw)) {
    throw new Error("HTTPS の公式ログインURLを入力してください。");
  }
  const url = new URL(raw);
  if (url.username || url.password || !url.hostname) {
    throw new Error("利用者名やパスワードを含まないURLを入力してください。");
  }
  return url.href;
}

/** 変更される証明書と、登録を通じて維持するプロファイルIDを別の項目にする。 */
export function registration(fields, certificate, previousId, now = Date.now()) {
  if (!certificate || !fingerprintPattern.test(certificate.fingerprint) ||
      !(Date.parse(certificate.from) <= now && now < Date.parse(certificate.to))) {
    throw new Error("有効期間内の証明書を選んでください。");
  }
  const company = fields.company.trim();
  const service = fields.service.trim();
  const usage = fields.usage.trim();
  if (!company || !service || [company, service, usage].some(value => value.length > 100)) {
    throw new Error("法人名と銀行・サービス名を入力してください。各項目は100文字までです。");
  }
  return {id: previousId ?? crypto.randomUUID(), company, service, usage,
    url: loginUrl(fields.url), renewalUrl: fields.renewalUrl?.trim() ? loginUrl(fields.renewalUrl) : "",
    certificate: {...certificate}};
}

/** 登録一覧と起動メッセージで同じ用途名を表示する。 */
export function entryName(entry) {
  return [entry.company, entry.service, entry.usage].filter(Boolean).join(" ／ ");
}

/** 別画面で登録先や証明書を変更したかを比較し、更新前の内容での起動・上書きを防ぐ。 */
export function sameRegistration(a, b) {
  return Boolean(a && b && a.certificate.fingerprint === b.certificate.fingerprint &&
    ["id", "company", "service", "usage", "url", "renewalUrl"].every(key => (a[key] ?? "") === (b[key] ?? "")));
}
