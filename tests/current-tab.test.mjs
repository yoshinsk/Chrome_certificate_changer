// tests/current-tab.test.mjs | 公式ログイン先の区別、指紋の照合、古い通信の判定を合成データで確かめる。
import assert from "node:assert/strict";
import {test} from "node:test";
import {runInNewContext} from "node:vm";
import {atBank, bankOrigin, matchFingerprint, normalizeFingerprint, readPageReceipt} from "../extension/current-tab.mjs";

const origin = "https://bank.example";
const href = origin + "/login";
const hash = "1A".repeat(32);
const metric = {name: "mtls-client-cert-sha256", description: hash};
const companyA = {company: "A社", url: href, certificate: {fingerprint: hash, serial: "101"}};
const companyB = {company: "B社", url: origin + ":443/other", certificate: {fingerprint: "BF".repeat(32), serial: "202"}};

test("同一の認証先をホストとポートで比較し、別ポートや不正な登録を除外する", () => {
  const onOtherPort = {...companyA, url: origin + ":4430/other"};
  assert.deepEqual(atBank([companyA, companyB, onOtherPort], bankOrigin(href)), [companyA, companyB]);
  for (const url of ["http://bank.example", "https://user@bank.example/", "chrome://settings", undefined]) {
    assert.equal(bankOrigin(url), null);
  }
  assert.deepEqual(atBank([companyA], null), []);
});

test("手入力は SHA-256 の全32バイトを比較し、省略・余分な文字・壊れた区切りを拒否する", () => {
  assert.equal(normalizeFingerprint(hash.toLowerCase()), hash);
  assert.equal(normalizeFingerprint(Array(32).fill("1a").join(":")), hash);
  for (const input of ["1A".repeat(20), hash.slice(1), hash + ":00", "X".repeat(64), ":".repeat(64), "1A:" + hash.slice(2)]) {
    assert.equal(normalizeFingerprint(input), null);
  }
});

test("実際の指紋と選択予定が違う場合、未登録の場合、同じ証明書を複数登録した場合を区別する", () => {
  const same = {...companyA, company: "C社"};
  const text = matchFingerprint(hash, [companyA, companyB, same], companyB);
  assert.match(text, /A社、C社/);
  assert.match(text, /選択中の登録とは異なる/);
  assert.match(text, /101/);
  assert.match(matchFingerprint(hash, [], null), /一致する登録はありません/);
  assert.doesNotMatch(matchFingerprint(hash, [companyA], companyA), /異なる/);
  assert.throws(() => matchFingerprint("101", [], null));
});

/** 注入時と同じ独立した実行環境を作る。他のモジュールやページ本文を参照した場合も検出する。 */
function read(changes = {}, context = {}) {
  const entry = {name: href, type: "navigate", responseStatus: 200, transferSize: 608,
    encodedBodySize: 308, responseEnd: 60, responseStart: 45, serverTiming: [metric], ...changes};
  const window = {isSecureContext: true, navigation: {activation: {navigationType: "push"}}};
  window.top = window;
  const document = {visibilityState: "visible"};
  const location = {origin, href};
  const performance = {timeOrigin: 1500, getEntriesByType: type => type === "navigation" ? [entry] : []};
  return runInNewContext("(" + readPageReceipt.toString() + ")(origin)", {origin, location, performance, window, document, ...context});
}

test("メイン文書を取得した時刻と、その応答が単独で通知した SHA-256 を返す", () => {
  const receipt = read({type: "reload", serverTiming: [{...metric, description: hash.toLowerCase()}]});
  assert.equal(receipt.hash, hash);
  assert.equal(receipt.at, 1545);
  assert.equal(read({serverTiming: [metric, metric]}), null);
  assert.equal(read({serverTiming: [{name: "other", description: hash}]}), null);
  assert.equal(read({serverTiming: [{...metric, description: hash.slice(2)}]}), null);
  assert.equal(read({serverTiming: []}), null);
});

test("履歴、キャッシュの再検証、サービスワーカー、別文書、非表示の応答を現在の証拠にしない", () => {
  for (const change of [{type: "back_forward"}, {responseStatus: 304}, {transferSize: 300}, {encodedBodySize: 0},
    {deliveryType: "cache"}, {activationStart: 5}, {responseEnd: 0}, {workerStart: 5}, {name: origin + "/before"}]) {
    assert.equal(read(change), null);
  }
  assert.equal(read({}, {location: {origin: "https://elsewhere.example", href}}), null);
  assert.equal(read({}, {document: {visibilityState: "hidden"}}), null);
  assert.equal(read({}, {document: {visibilityState: "visible", prerendering: true}}), null);
  const window = {isSecureContext: true, navigation: {activation: {navigationType: "traverse"}}};
  window.top = window;
  assert.equal(read({}, {window}), null);
});
