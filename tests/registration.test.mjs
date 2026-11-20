// tests/registration.test.mjs | 既存証明書の登録・同名更新・有効期間と、銀行URLの制約を検証する。
import assert from "node:assert/strict";
import {test} from "node:test";
import {entryName, loginUrl, registration, sameRegistration} from "../extension/registration.mjs";

// 期限境界と同名更新を、OS の時計や実際の証明書に依存せず再現する。
const now = Date.parse("2026-11-20T03:00:00Z");
const fields = {company: "A社", service: "検証銀行", usage: "経理", url: "https://bank.example/login"};
const certificate = {name: "共通の名義", subject: "CN=Common", issuer: "CN=Test",
  fingerprint: "A".repeat(64), from: "2026-11-01T00:00:00Z", to: "2026-12-01T00:00:00Z"};

test("初回に用途IDを作成し、法人・銀行・担当者を表示する", () => {
  const entry = registration(fields, certificate, undefined, now);
  assert.match(entry.id, /^[0-9a-f-]{36}$/);
  assert.equal(entryName(entry), "A社 ／ 検証銀行 ／ 経理");
  assert.equal(entry.renewalUrl, "");
});

test("外部で更新した同名の証明書を明示的に選ぶと同じ登録とプロファイルを引き継ぐ", () => {
  const old = registration(fields, certificate, undefined, now);
  const next = registration({...fields, renewalUrl: "https://bank.example/renew"},
    {...certificate, fingerprint: "B".repeat(64)}, old.id, now);
  assert.equal(next.id, old.id);
  assert.equal(next.certificate.name, old.certificate.name);
  assert.notEqual(next.certificate.fingerprint, old.certificate.fingerprint);
  assert.equal(next.renewalUrl, "https://bank.example/renew");
});

test("有効期間の開始時刻は登録でき、終了時刻・未選択・指紋の欠損を拒否する", () => {
  assert.doesNotThrow(() => registration(fields, certificate, undefined, Date.parse(certificate.from)));
  for (const bad of [null, {...certificate, from: certificate.to}, {...certificate, fingerprint: ""},
                     {...certificate, to: "invalid"}]) {
    assert.throws(() => registration(fields, bad, undefined, now));
  }
  assert.throws(() => registration(fields, certificate, undefined, Date.parse(certificate.to)));
});

test("ログイン先も更新窓口も認証情報を含まないHTTPSに限る", () => {
  for (const url of ["http://bank.example/", "file:///c:/app", "https://u:p@bank.example/",
    '--new-window', 'https://bank.example/"', 'https://bank.example/\\path', 'https://bank.example/a b', 'https://bank.example/a\0b']) {
    assert.throws(() => loginUrl(url));
    assert.throws(() => registration({...fields, renewalUrl: url}, certificate, undefined, now));
  }
  assert.equal(loginUrl("https://bank.example/path?service=a#login"), "https://bank.example/path?service=a#login");
});

test("同じ銀行の用途を別登録にでき、入力不足は保存しない", () => {
  const a = registration(fields, certificate, undefined, now);
  const b = registration({...fields, usage: "承認"}, certificate, undefined, now);
  assert.notEqual(a.id, b.id);
  assert.throws(() => registration({...fields, company: " "}, certificate, undefined, now));
  assert.throws(() => registration({...fields, service: "あ".repeat(101)}, certificate, undefined, now));
});

test("別タブの更新を検出し、更新URLがない従来の登録も比較できる", () => {
  const original = registration(fields, certificate, undefined, now);
  assert.equal(sameRegistration(original, {...original, renewalUrl: undefined}), true);
  assert.equal(sameRegistration(original, {...original, certificate: {...certificate, fingerprint: "B".repeat(64)}}), false);
  assert.equal(sameRegistration(original, {...original, url: "https://bank.example/other"}), false);
  assert.equal(sameRegistration(undefined, original), false);
});
