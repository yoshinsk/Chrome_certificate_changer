# 検証結果と開発者向けの手順

[利用者向けの使い方とダウンロード](../Readme.md)

## 公開α版の配布物

v0.3.1-alpha.1 の Windows インストーラーを展開し、拡張機能の全6ファイルをソースと照合しました。同梱した MIT ライセンス本文と NSIS の著作権・ライセンス文書も原本と一致しました。

展開した拡張機能を通常版 Chrome の新しい試験用プロファイルに追加し、下表の同一タブでの接続と、拡張ボタンでの一致・不一致・未確認の表示を再検証しました。変更前後に JavaScript の11件と補助アプリの5件のテストが通りました。使用中の旧版があるため、このユーザーでのα版の新規導入・上書き・削除の自動試験はスキップしました。

## ブラウザーでの検証結果

2026年11月20日、Windows 11 Pro 上の通常版 Chrome 157.0.8103.40 と Edge 157.0.4341.42 で、端末内の相互 TLS サーバーに接続しました。Windows の個人ストアに試験用のA社・B社の証明書を登録し、サーバーが受け取った証明書の SHA-256 指紋を照合しました。

| 同じタブ・同じウィンドウでの操作 | サーバーと画面で確かめたこと |
| --- | --- |
| Chrome でA社を選んだ後、拡張ボタンで同じ認証先のB社用URLを開く | URLのパスは変わり、サーバーは再びAを受信。指紋を通知したページでは拡張画面にA社と選択の不一致を表示 |
| Chrome で Cookie とキャッシュの消去を指示する応答を受け、同じ認証先に接続する | 試験 Cookie は消えたが、サーバーはAを受信。指紋を通知しないページの表示は「未確認」 |
| Chrome で別のホスト名へ移りBを選び、元の接続先に戻る | 別のホストではBを受信。元のホストでは再びAを受信 |
| Edge でサイト情報の「証明書の変更」からAをBに変更する | 同じURLで、新しいウィンドウやタブは増えず、サーバーの受信は A → B。Edge のサイト情報の名義も A → B |

これらの試験では毎回 TLS 接続を張り直し、セッションを再開していないこともサーバーで確認しました。Chrome の同一タブではツールバーから実際に拡張機能を開き、手入力の照合が接続先の通知を書き換えないことも確かめました。

### 接続先からの通知方法

検証サーバーは各要求の TLS クライアント証明書から計算した指紋を `Server-Timing` の独自項目 `mtls-client-cert-sha256` の `desc` に16進64桁で返します。対象文書は HTTPS の新しい 200 応答で `Cache-Control: no-store` とします。この通知方法を採用した実際の銀行は確認できていません。拡張機能は対象のメイン文書で通知を読みます。履歴やキャッシュからの復元、サービスワーカー経由の応答、指紋の欠落や重複は未確認とします。[W3C の Server Timing 仕様](https://www.w3.org/TR/server-timing/)

企業では Chrome の管理ポリシーで、名義や発行者の条件に合う証明書をサイトごとに自動選択できます。この設定はプロファイル単位です。タブや証明書のシリアル番号、SHA-256 指紋は指定できません。試用版はこの設定を変更しません。[Chrome の自動選択ポリシーの定義](https://github.com/chromium/chromium/blob/157.0.8103.40/components/policy/resources/templates/policy_definitions/ContentSettings/AutoSelectCertificateForUrls.yaml)

### 法人ごとの専用ウィンドウでの検証

| 操作 | サーバーで確認した結果 |
| --- | --- |
| A社 → B社 → A社と切り替える | A → B → A の順に一致 |
| A社を指定し、Chrome の選択画面でB社を選ぶ | Bを受信し、不一致を表示。銀行を模した画面は開いたまま |
| A社の専用プロファイルで更新窓口を開く | 旧証明書Aで接続 |
| 外部で発行した同名の新証明書に手動で登録を変更する | 同じ登録IDで新証明書A2を受信 |

Chrome for Testing 155.0.8059.79 では、拡張画面から新規登録、一覧の再読み込み、同名証明書への変更を行い、そのプロファイルで登録済みの更新URLを開けることを確認しました。拡張画面から補助アプリ経由で通常版 Chrome を開いた試験でも、検証サーバーは A2 を受信しました。

v0.2.0 では管理者権限のない Windows ユーザーで配布用 EXE の新規導入、上書き、削除を試験しました。v0.3.0 ではインストーラーから展開した拡張機能の全ファイルをソースと照合し、通常版 Chrome 157 の試験用プロファイルで同じタブの起動・照合を試験しました。

これら6ケースで Chrome の診断 API が返した指紋は、すべて接続先のサーバー証明書と一致しました。[Chrome の接続情報](https://developer.chrome.com/docs/extensions/reference/api/webRequest#type-SecurityInfo)

### Windows 側で提示した証明書を特定できた条件

通常版 Chrome 157 の使い捨てプロファイルから、端末内の検証サーバーに TLS 1.3 で接続しました。Windows 側の試験プログラムには、利用者が選んだ証明書もサーバーの受信結果も渡していません。検証サーバーの証明書で接続を絞り、Chrome が送信用に組み立てたクライアント証明書の SHA-256 指紋を求めました。答え合わせには、サーバーが受け取った証明書を使いました。

| 診断の設定・Chrome での操作 | Windows 側の判定 | サーバーの受信 |
| --- | --- | --- |
| 標準の診断。Aを登録してBを選択 | 未確認 | B |
| 詳細な診断。Aを登録してBを選択 | B | B |
| 同じ名義・同じ鍵で更新し、旧証明書Aを選択（詳細） | A | A |
| 同じ名義・同じ鍵で更新し、新証明書A2を選択（詳細） | A2 | A2 |
| Bを選んだ後、確定せずにキャンセル（詳細） | 未確認 | 受信なし |

この試験の A と A2 は署名の検証に使う公開鍵が同じです。Windows が秘密鍵の利用を許可したという情報だけでは、どちらの証明書を接続先へ送ったか確定できません。検証機で標準ユーザーが Windows の暗号処理の運用ログ（CAPI2）を照会したところ、アクセスを拒否されました。[Windows の秘密鍵取得 API](https://learn.microsoft.com/en-us/windows/win32/api/wincrypt/nf-wincrypt-cryptacquirecertificateprivatekey)・[Chrome が Windows の鍵を使う処理](https://chromium.googlesource.com/chromium/src/+/HEAD/net/ssl/ssl_platform_key_win.cc)

Chrome の標準診断（NetLog）はクライアントの証明書本体を省略します。詳細診断では識別できましたが、通信の本文も記録され得ます。試験では接続先を端末内に限定し、診断ファイルは終了時に削除しました。[Chrome 157 の診断処理](https://github.com/chromium/chromium/blob/157.0.8103.40/net/socket/ssl_client_socket_impl.cc#L125-L140)

確認できたのは、新しく接続して証明書を送ったケースです。接続の再利用や TLS セッションの再開では、証明書が毎回送られるとは限りません。Chrome 側の送信記録だけでは銀行が受け取った証明書やログインした法人を確定できません。試用版は銀行接続の詳細診断を無効にしています。実際の銀行に共通して使える確認方法は未確立です。[TLS 1.3 の仕様](https://datatracker.ietf.org/doc/html/rfc9846)・[Chromium が説明する診断ログの用途と記録範囲](https://www.chromium.org/developers/design-documents/network-stack/netlog/)

## 試験の再現

Windows 11、通常版 Chrome、Node.js、Python と `cryptography` が必要です。上記の検証には Node.js 24.15.0、Python 3.14.4、cryptography 48.0.0 を使いました。リポジトリのフォルダーで次を実行してください。

```powershell
node --test tests/registration.test.mjs tests/current-tab.test.mjs
py -3 tests/host_test.py
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install cryptography==48.0.0
.\.venv\Scripts\python.exe lab/run.py
.\.venv\Scripts\python.exe lab/same-tab.py
.\.venv\Scripts\python.exe lab/same-tab.py --edge
.\.venv\Scripts\python.exe lab/evidence.py
```

試験は専用の Chrome ウィンドウを開き、そのプロセスの証明書選択画面を操作します。`lab/run.py` に `--manual` を付けると手動で証明書を選べます。ソースから拡張画面を試験する場合は、先に補助アプリを登録し、`--extension-browser` に Chrome for Testing の実行ファイルのパスを渡してください。

同じタブの拡張ボタンまで試すには、補助アプリの登録後に `lab/same-tab.py --extension-folder extension` を実行してください。フォルダーにはインストーラーから展開した拡張機能も指定できます。Edge 標準の証明書選択画面を試すオプションは `--edge` です。

試験用に生成したクライアント証明書は現在のユーザーの個人ストアへ一時登録し、試験終了時に発行者と指紋を確かめて鍵とともに撤去します。検証サーバーの公開鍵を許可する設定は試験プロセスだけに適用します。

### インストーラーのビルドと試験

開発者は Windows 11 で NSIS 3 の `makensis.exe` を用意し、次のコマンドを実行します。配布するファイルは `dist\ChromeCertificateChanger-Setup.exe` です。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\Build.ps1 -MakeNsis 'C:\Program Files (x86)\NSIS\makensis.exe'
py -3 tests/installer_test.py -v
```

インストーラーの試験は配布版をまだ使っていない Windows ユーザーで実行してください。上書きや削除の後も法人用プロファイルが残ることと、以前使っていた補助アプリの登録が削除時に元に戻ることを確かめます。

インストーラーを導入した後は `.\.venv\Scripts\python.exe lab/run.py --installed` で配布物を検証できます。開発版だけを手動で登録するときは `native\Install.ps1` とソースの `extension` フォルダーを使います。
