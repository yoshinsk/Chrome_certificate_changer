// lab/server.mjs | ループバックの相互TLS接続で受け取った証明書を照合し、答え合わせの結果を表示する。
import {createServer} from "node:https";
import {constants} from "node:crypto";
import {readFileSync} from "node:fs";

// 生成済みの検証用証明書だけを信頼する。銀行や外部のサーバーには接続しない。
const fixture = JSON.parse(readFileSync(process.argv[2], "utf8"));
const server = createServer({
  cert: fixture.serverCert, key: fixture.serverKey, ca: fixture.ca,
  requestCert: true, rejectUnauthorized: true, minVersion: "TLSv1.2",
  secureOptions: constants.SSL_OP_NO_TICKET,
}, (request, response) => {
  // 資格情報やクエリを記録せず、定義した試験ケースへのアクセスだけを照合する。
  const expected = request.url.slice(1);
  if (expected === "probe") {
    response.writeHead(204, {"Cache-Control": "no-store", Connection: "close"}).end();
    return;
  }
  if (!Object.hasOwn(fixture.cases, expected)) {
    response.writeHead(404, {Connection: "close"}).end();
    return;
  }
  const fingerprint = request.socket.getPeerCertificate().fingerprint256?.replaceAll(":", "");
  const actual = Object.keys(fixture.identities).find(key => fixture.identities[key] === fingerprint);
  const wanted = fixture.cases[expected];
  const matches = wanted === actual;
  const event = {case: expected, wanted, actual: actual ?? "未登録", fingerprint, matches,
    resumed: request.socket.isSessionReused(), protocol: request.socket.getProtocol()};
  console.log(JSON.stringify(event));
  response.writeHead(200, {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; connect-src 'self'", Connection: "close"});
  response.end('<!doctype html><html lang="ja"><meta charset="utf-8"><title>証明書の照合</title>' +
    '<h1>検証サーバーの受信結果</h1><p>' + (matches ? '一致' : '不一致') + '</p><p>指定　' + wanted +
    '</p><p>受信　' + event.actual + '</p><p>SHA-256　' + fingerprint +
    '</p><p>この結果は、検証サーバーがこの接続で受け取った証明書から求めました。</p></html>');
});

// OS に空いているポートを割り当ててもらい、検証の全ケースで同じ接続先を使う。
server.listen(0, "127.0.0.1", () => console.log(JSON.stringify({port: server.address().port})));
