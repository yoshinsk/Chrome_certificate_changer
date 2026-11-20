# 法人別 証明書切替

Windows 11 の Google Chrome で、複数の法人が同じ銀行を順番に利用するための試用版です。普段のタブを開いたまま、法人ごとのウィンドウで銀行を開けます。Windows 版 Chrome でお使いのソフトウェア証明書をそのまま利用できます。更新には引き続き銀行の画面や指定の更新ツールを使います。

**銀行に実際に提示した証明書は、試用版では「使用証明書は未確認」と表示します。** 「登録証明書」はその法人に使う予定の証明書です。取引に進む前に、銀行の画面に表示された法人名・利用者名を確認してください。実銀行での動作は未検証のため、本番導入は保留しています。

## ダウンロードと初回設定

**[Windows 用インストーラーをダウンロード](https://github.com/yoshinsk/Chrome_certificate_changer/releases/latest/download/ChromeCertificateChanger-Setup.exe)**

非公開のため、このリポジトリを閲覧できる GitHub アカウントでログインしてください。試用版のインストーラーにはコード署名がありません。会社の PC で実行が止まった場合は、表示された画面を配布担当者に見せてください。[最新版のリリースページ](https://github.com/yoshinsk/Chrome_certificate_changer/releases/latest)

1. ダウンロードした `ChromeCertificateChanger-Setup.exe` をダブルクリックし、「インストール」→「完了」の順に押します。日本語の設定ガイドが開きます。
2. ガイドの「フォルダーの場所をコピーして Chrome を開く」を押します。Chrome の右上で「デベロッパー モード」をオンにし、左上の「パッケージ化されていない拡張機能を読み込む」を押します。
3. 開いた画面の下にある「フォルダー」欄をクリックします。Ctrl キーを押しながら V を押して場所を貼り付け、「フォルダーの選択」を押します。
4. Chrome に「法人別 証明書切替」が表示されたら、ガイドの「法人の登録画面を開く」を押します。次回は Windows のスタートメニューの「法人別 証明書切替」からも開けます。

管理者権限やコマンド入力は不要です。初回に Chrome でフォルダーを選ぶのは、この試用版を Chrome ウェブストアに掲載していないためです。ガイドを開き直すには、スタートメニューで「法人別 証明書切替 の設定」を選びます。会社の設定で「デベロッパー モード」を選べない場合は、社内の Chrome 管理者にご相談ください。[Chrome 公式の拡張機能の読み込み手順](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)

## 法人の登録と切替

1. 「新規登録」で法人名、銀行・サービス名、公式ログインURLを入力します。経理用と承認用を分けるときは、それぞれの用途名で登録します。銀行が専用の更新窓口を案内している場合は、その公式更新URLも入力できます。
2. 「Windows に登録済みの証明書」から1枚を選び、名義、発行者、シリアル番号、有効期間を確かめて保存します。証明書を1枚ずつ識別するために、拡張機能は証明書全体の SHA-256 指紋を記録します。
3. 利用中の銀行でログアウトし、拡張画面の「利用する登録」を切り替えて「専用ウィンドウで銀行を開く」を押します。Chrome が証明書の選択を求めたら、登録内容とシリアル番号を照合して選んでください。

Chrome のツールバーから開いた場合は「タブで開く」を押すと、登録内容と銀行の証明書選択画面を見比べられます。

登録1件につき専用の Chrome プロファイルを1つ使います。接続先ごとの選択履歴や銀行の Cookie は用途ごとに分かれ、Windows の個人証明書ストアは共通です。Chrome に表示される候補は銀行の認証要求によって変わります。[Chromium の通信設計](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/net/docs/life-of-a-url-request.md#the-network-service-and-mojo)

## 証明書の更新

1. **これまで使っていた銀行の画面または銀行指定の更新ツール**で、通常どおり更新します。拡張画面の「銀行で証明書を更新する」からも、普段の Chrome と専用ウィンドウのどちらで窓口を開くか選べます。登録した公式更新URLを開き、省略した場合は公式ログインURLを開きます。旧証明書の期限が過ぎても窓口は開けます。期限切れ後の更新や再発行の手続きは銀行の案内に従ってください。
2. 銀行での更新が終わったら「登録・証明書を変更」から「証明書一覧を再読み込み」を押します。同じ名義の新旧2枚が並んだ場合は、シリアル番号、期限、SHA-256 指紋で新しい1枚を選び、保存します。
3. その用途の銀行画面でログアウトし、該当する専用ウィンドウをすべて閉じてから開き直します。新しい証明書でも同じ登録IDと専用プロファイルを使います。普段の Chrome や他法人用のウィンドウは開いたまま作業できます。

検証では拡張機能の外から同名の新証明書を個人ストアに追加し、旧証明書を残した状態で新しい1枚に切り替えました。各銀行固有の発行・更新手続き、ICカード、USBトークンは未検証です。

## 保存先

対象は Windows 版 Chrome が「現在のユーザー／個人」ストアから選ぶソフトウェア証明書です。補助アプリはこのストアを読み取り専用で開きます。秘密鍵の書き出しや証明書の入れ直しは不要です。[Chromium の Windows 証明書ストアの仕様](https://github.com/chromium/chromium/blob/main/net/ssl/client_cert_store_win.h)

| 内容 | 保存先 |
| --- | --- |
| 法人名、用途、銀行URL、公開証明書の識別情報 | 拡張機能を読み込んだ Chrome プロファイルのローカルストレージ |
| 銀行用の Chrome プロファイル | `%LOCALAPPDATA%\ChromeCertificateChanger\profiles\<登録ID>` |
| 配布版の拡張機能・Windows 補助アプリ | `%LOCALAPPDATA%\ChromeCertificateChanger\program` 内の `extension`・`host` |
| 秘密鍵 | 発行時に指定された Windows の鍵プロバイダー |

拡張機能の権限はローカル保存と補助アプリとの通信の2つです。[Chrome の Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)

### 試用版の更新・削除

新版が出たら、同じダウンロードリンクからインストーラーを開きます。設定ガイドから Chrome の拡張機能画面を開き、「法人別 証明書切替」のカードにある再読み込みボタンを押してください。登録した法人と専用ウィンドウの保存先を引き継げます。

試用版を削除するには、Chrome の拡張機能画面で「法人別 証明書切替」の「削除」を押してください。次に Windows の「設定」→「アプリ」→「インストールされているアプリ」から同じ名前のアプリをアンインストールします。拡張機能を削除すると、登録した法人と証明書の組み合わせは消えます。Windows の証明書と法人用の Chrome プロファイルはそのままです。[Chrome のローカル保存の仕様](https://developer.chrome.com/docs/extensions/reference/api/storage#storage-areas)

## 検証結果

2026年11月20日、Windows 11 Pro、Google Chrome 157.0.8103.40 で、同じループバックの相互 TLS サーバーに接続しました。サーバーが受け取った証明書の SHA-256 指紋を、各ケースの期待値と照合しました。

| 操作 | サーバーで確認した結果 |
| --- | --- |
| A社 → B社 → A社と切り替える | A → B → A の順に一致 |
| A社を指定し、Chrome の選択画面でB社を選ぶ | Bを受信し、不一致を表示。銀行を模した画面は開いたまま |
| A社の専用プロファイルで更新窓口を開く | 旧証明書Aで接続 |
| 外部で発行した同名の新証明書に手動で登録を変更する | 同じ登録IDで新証明書A2を受信 |

Chrome for Testing 155.0.8059.79 では、拡張画面から新規登録、一覧の再読み込み、同名証明書への変更を行い、そのプロファイルで登録済みの更新URLを開けることを確認しました。拡張画面から補助アプリ経由で通常版 Chrome を開いた試験でも、検証サーバーは A2 を受信しました。

配布用 EXE は管理者権限のない Windows ユーザーで新規導入、上書き、削除を試験しました。通常版 Chrome 157 の新しいプロファイルでフォルダーを選び、配布版の登録画面から法人登録、更新窓口の起動、証明書切替まで確認しました。

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
node --test tests/registration.test.mjs
py -3 tests/host_test.py
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install cryptography==48.0.0
.\.venv\Scripts\python.exe lab/run.py
.\.venv\Scripts\python.exe lab/evidence.py
```

試験は専用の Chrome ウィンドウを開き、そのプロセスの証明書選択画面を操作します。`lab/run.py` に `--manual` を付けると手動で証明書を選べます。ソースから拡張画面を試験する場合は、先に補助アプリを登録し、`--extension-browser` に Chrome for Testing の実行ファイルのパスを渡してください。

試験用に生成したクライアント証明書は現在のユーザーの個人ストアへ一時登録し、試験終了時に発行者と指紋を確かめて鍵とともに撤去します。検証サーバーの公開鍵を許可する設定は試験プロセスだけに適用します。

### インストーラーのビルドと試験

開発者は Windows 11 で NSIS 3 の `makensis.exe` を用意し、次のコマンドを実行します。配布するファイルは `dist\ChromeCertificateChanger-Setup.exe` です。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\Build.ps1 -MakeNsis 'C:\Program Files (x86)\NSIS\makensis.exe'
py -3 tests/installer_test.py -v
```

インストーラーの試験は配布版をまだ使っていない Windows ユーザーで実行してください。上書きや削除の後も法人用プロファイルが残ることと、以前使っていた補助アプリの登録が削除時に元に戻ることを確かめます。

インストーラーを導入した後は `.\.venv\Scripts\python.exe lab/run.py --installed` で配布物を検証できます。開発版だけを手動で登録するときは `native\Install.ps1` とソースの `extension` フォルダーを使います。
