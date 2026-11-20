# 法人別 証明書切替

Windows 11 の Google Chrome で、同じ銀行を複数の法人や担当者が順番に利用するための試作品です。普段のタブを開いたまま、登録した用途の専用ウィンドウで銀行を開けます。

**Windows 版 Chrome が「現在のユーザー／個人」ストアから選ぶソフトウェア証明書を、そのまま利用できます。** 補助アプリはストアを読み取り専用で開き、秘密鍵が関連付けられた証明書を一覧に表示します。秘密鍵の書き出しや PFX の再取り込みは不要です。[Chromium の Windows 証明書ストアの仕様](https://github.com/chromium/chromium/blob/main/net/ssl/client_cert_store_win.h)

拡張画面の「登録証明書」は利用者がその用途に指定した証明書です。銀行への接続で実際に提示した証明書を拡張機能から特定する機能は未達で、画面には「使用証明書は未確認」と表示します。実銀行への導入は保留しています。[Chrome の通信情報 API](https://developer.chrome.com/docs/extensions/reference/api/webRequest#type-SecurityInfo)

## 導入

1. Windows 11 の利用者アカウントでリポジトリのフォルダーを開き、PowerShell で次のコマンドを実行します。Windows 標準の .NET Framework コンパイラで補助アプリを作成し、現在のユーザーに登録します。

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\native\Install.ps1
   ```

2. 普段使う Chrome で `chrome://extensions` を開き、「デベロッパー モード」を有効にします。「パッケージ化されていない拡張機能を読み込む」で、このリポジトリの `extension` フォルダーを選びます。[Chrome 公式の拡張機能の読み込み手順](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)
3. ツールバーの「法人別 証明書切替」を開きます。「タブで開く」を選ぶと、銀行の証明書選択画面と登録内容を見比べられます。

利用には Chrome と補助アプリを使います。後述の Python と Node.js は開発者が試験を再現するためのものです。

## 法人の登録と切替

1. 「新規登録」で法人名、銀行・サービス名、公式ログインURLを入力します。経理用と承認用を分けるときは、それぞれの用途名で登録します。銀行が専用の更新窓口を案内している場合は、その公式更新URLも入力できます。
2. 「Windows に登録済みの証明書」から1枚を選び、名義、発行者、シリアル番号、有効期間を確かめて保存します。証明書を1枚ずつ識別するために、拡張機能は証明書全体の SHA-256 指紋を記録します。
3. 利用中の銀行でログアウトし、拡張画面の「利用する登録」を切り替えて「専用ウィンドウで銀行を開く」を押します。Chrome が証明書の選択を求めたら、登録内容とシリアル番号を照合して選んでください。

登録1件につき専用の Chrome プロファイルを1つ使います。接続先ごとの選択履歴や銀行の Cookie は用途ごとに分かれ、Windows の個人証明書ストアは共通です。Chrome に表示される候補は銀行の認証要求によって変わります。[Chromium の通信設計](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/net/docs/life-of-a-url-request.md#the-network-service-and-mojo)

## 証明書の更新

1. **これまで使っていた銀行の画面または銀行指定の更新ツール**で、通常どおり更新します。拡張画面の「銀行で証明書を更新する」からも、普段の Chrome と専用ウィンドウのどちらで窓口を開くか選べます。登録した公式更新URLを開き、省略した場合は公式ログインURLを開きます。旧証明書の期限が過ぎても窓口は開けます。期限切れ後の更新や再発行の手続きは銀行の案内に従ってください。
2. 銀行での更新が終わったら「登録・証明書を変更」から「証明書一覧を再読み込み」を押します。同じ名義の新旧2枚が並んだ場合は、シリアル番号、期限、SHA-256 指紋で新しい1枚を選び、保存します。
3. その用途の銀行画面でログアウトし、該当する専用ウィンドウをすべて閉じてから開き直します。新しい証明書でも同じ登録IDと専用プロファイルを使います。普段の Chrome や他法人用のウィンドウは開いたまま作業できます。

検証では拡張機能の外から同名の新証明書を個人ストアに追加し、旧証明書を残した状態で新しい1枚に切り替えました。各銀行固有の発行・更新手続き、ICカード、USBトークンは未検証です。

## 保存先

| 内容 | 保存先 |
| --- | --- |
| 法人名、用途、銀行URL、公開証明書の識別情報 | 拡張機能を読み込んだ Chrome プロファイルのローカルストレージ |
| 銀行用の Chrome プロファイル | `%LOCALAPPDATA%\ChromeCertificateChanger\profiles\<登録ID>` |
| Windows 補助アプリ | `%LOCALAPPDATA%\ChromeCertificateChanger\host` |
| 秘密鍵 | 発行時に指定された Windows の鍵プロバイダー |

拡張機能の権限はローカル保存と補助アプリとの通信の2つです。[Chrome の Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)

## 検証結果

2026年11月20日、Windows 11 Pro、Google Chrome 157.0.8103.40 で、同じループバックの相互 TLS サーバーに接続しました。サーバーが受け取った証明書の SHA-256 指紋を、各ケースの期待値と照合しました。

| 操作 | サーバーで確認した結果 |
| --- | --- |
| A社 → B社 → A社と切り替える | A → B → A の順に一致 |
| A社を指定し、Chrome の選択画面でB社を選ぶ | Bを受信し、不一致を表示。銀行を模した画面は開いたまま |
| A社の専用プロファイルで更新窓口を開く | 旧証明書Aで接続 |
| 外部で発行した同名の新証明書に手動で登録を変更する | 同じ登録IDで新証明書A2を受信 |

Chrome for Testing 155.0.8059.79 では、拡張画面から新規登録、一覧の再読み込み、同名証明書への変更を行い、そのプロファイルで登録済みの更新URLを開けることを確認しました。拡張画面から補助アプリ経由で通常版 Chrome を開いた試験でも、検証サーバーは A2 を受信しました。

切替、誤選択、更新を調べた6ケースで、Chrome の診断 API が返した指紋はすべて検証サーバーの証明書と一致しました。拡張機能から、サーバーに提示した A、B、A2 のどれかを特定する条件は未達です。[Chrome の接続情報](https://developer.chrome.com/docs/extensions/reference/api/webRequest#type-SecurityInfo)・[Chromium の診断ログの位置づけ](https://www.chromium.org/developers/design-documents/network-stack/netlog/)

## 試験の再現

Windows 11、通常版 Chrome、Node.js、Python と `cryptography` が必要です。上記の検証には Node.js 24.15.0、Python 3.14.4、cryptography 48.0.0 を使いました。リポジトリのフォルダーで次を実行してください。

```powershell
node --test tests/registration.test.mjs
py -3 tests/host_test.py
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install cryptography==48.0.0
.\.venv\Scripts\python.exe lab/run.py
```

試験は専用の Chrome ウィンドウを開き、そのプロセスの証明書選択画面を操作します。`--manual` を付けると手動で選べます。拡張画面の試験も行う場合は、先に補助アプリを登録し、`--extension-browser` に Chrome for Testing の実行ファイルのパスを渡してください。

試験用に生成したクライアント証明書は現在のユーザーの個人ストアへ一時登録し、試験終了時に発行者と指紋を確かめて鍵とともに撤去します。検証サーバーの公開鍵を許可する設定は試験プロセスだけに適用します。
