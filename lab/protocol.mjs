// lab/protocol.mjs | 今回起動したループバックの試験ブラウザに限り、開発者ツール要求を順番に送る。
import {once} from "node:events";

/** 同じソケットを使い続け、Network.enable 後に取得した接続情報を同じセッションで調べる。 */
export async function session(endpoint, port, action) {
  const url = new URL(endpoint);
  if (url.protocol !== "ws:" || url.host !== "127.0.0.1:" + port ||
      !/^\/devtools\/(browser|page)\/[\w-]+$/.test(url.pathname)) throw new Error("検証用のローカル接続先が不正です。");
  const socket = new WebSocket(url);
  let id = 0;
  try {
    await once(socket, "open", {signal: AbortSignal.timeout(5000)});
    // 呼び出し側は1件ずつ await する。通知イベントを除き、送った要求番号と同じ応答だけを返す。
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const number = ++id;
      const timer = setTimeout(() => reject(new Error("Chrome の応答待ちがタイムアウトしました。 " + method)), 25000);
      socket.onerror = () => { clearTimeout(timer); reject(new Error("検証用 Chrome と通信できません。")); };
      socket.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.id !== number) return;
        clearTimeout(timer);
        if (data.error) reject(new Error(data.error.message)); else resolve(data.result);
      };
      socket.send(JSON.stringify({id: number, method, params}));
    });
    return await action(send);
  } finally { socket.close(); }
}
