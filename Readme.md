# 法人別 証明書切替

Windows 11 で複数の法人の銀行口座を扱う方向けの Chrome 拡張機能です。普段の Chrome で使っている電子証明書を選んで登録できます。更新にはこれまでどおり銀行の画面や指定の更新ツールを使います。

**同じ銀行の同じ認証先でA社からB社に切り替えるとき、Windows 版 Chrome には、拡張機能から今のタブの証明書を選び直す公開機能がありません。** Chrome では法人ごとの専用ウィンドウを使うと、ほかのウィンドウを閉じずに切り替えられます。銀行が Microsoft Edge に対応していれば、Edge 標準の操作で同じタブのまま証明書を確認し、選び直せます。[Chromium の証明書選択の実装](https://github.com/chromium/chromium/blob/157.0.8103.40/net/ssl/ssl_client_auth_cache.cc#L15-L35)・[りそな銀行の再選択手順](https://www.resonabank.co.jp/hojin/b_direct/security/syoumei_saisentaku.html)

| したいこと | 操作 |
| --- | --- |
| Chrome の今のタブで銀行を開く | 「このタブで銀行を開く」を押します。初めての認証先では、Chrome に求められたら証明書を選びます。 |
| 同じ銀行で別の法人の証明書を使う | Chrome では「専用ウィンドウで銀行を開く」を使います。Edge での操作は下の「Edge で同じタブの証明書を切り替える」に記載しています。 |
| Chrome でこのページに提示した証明書を確かめる | 銀行のタブで拡張機能を開き、「このタブの使用証明書を確認」を押します。接続先が指紋を通知した場合だけ結果が出ます。対応を確認した実際の銀行はありません。 |

試用前に銀行が案内する対応ブラウザーを確認してください。「登録証明書」はその法人に使う予定の証明書です。取引に進む前に銀行の画面で法人名・利用者名を確かめてください。実際の銀行でのログインや取引は未検証です。

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

### Chrome で今のタブを使う

1. 利用中の銀行でログアウトします。使いたいタブで Chrome 右上の拡張機能メニュー（パズルの形）を押し、「法人別 証明書切替」を選びます。
2. 「利用する登録」で法人を選び、「このタブで銀行を開く」を押します。今のタブに公式ログインページが開きます。初めて選ぶときは、Chrome の選択画面でシリアル番号を照合してください。
3. 使用証明書を確かめるには、銀行のページを表示した状態でもう一度メニューを開き、「このタブの使用証明書を確認」を押します。

Chrome は認証先ごとに証明書を記憶します。同じプロファイルで認証先のホスト名とポート番号が同じなら、前に選んだ証明書が使われます。法人を選び直したりログインURLの末尾を変えたりしても、証明書は切り替わりません。銀行の公式ログインURLが異なっていても、転送先で同じ認証サービスを使う場合があります。[Chromium のキャッシュの実装](https://github.com/chromium/chromium/blob/157.0.8103.40/net/ssl/ssl_client_auth_cache.cc#L15-L35)

接続先がページの応答で使用証明書の SHA-256 指紋を通知すると、拡張機能に通知元、読み込み時刻、指紋に一致する登録が表示されます。選んだ法人の登録と異なる場合は、その違いも表示します。通知がないページや、登録したログイン先とは別のアドレスで認証するページの表示は「使用証明書は未確認」です。結果が示すのは、このページを読み込んだときの証明書です。

銀行の画面に「使用したクライアント証明書」の SHA-256 指紋が表示されていれば、「銀行が画面に表示した指紋を照合する」に貼り付けて、登録と比較できます。アドレスバーから表示される銀行自身のサーバー証明書は、法人の登録と照合する対象には使えません。拡張ボタンを使えるのは、この拡張機能を追加した Chrome プロファイルです。[Chrome の接続情報 API](https://developer.chrome.com/docs/extensions/reference/api/webRequest#type-SecurityInfo)

### Edge で同じタブの証明書を切り替える

銀行が Edge に対応している場合に使えます。この操作に拡張機能は不要です。

1. 銀行でログアウトします。Edge で電子証明書を使って接続したページを表示します。
2. アドレスバー左のサイト情報アイコンを押し、「証明書の選択」を開きます。検証した Edge では、選択中の証明書の名義、発行者、有効期間をここで確認できました。
3. 「証明書の変更」→「変更」を押します。同じタブが再読み込みされたら、切替先の証明書を選びます。同名の候補があるときは、選択画面のシリアル番号で見分けてください。
4. もう一度「証明書の選択」を開き、切替後の名義を確かめます。銀行にログインしたら法人名も確認してください。

銀行の案内によっては「証明書の選択をリセットする」が表示されます。その場合は「選択肢をリセットする」を押し、銀行の電子証明書ログインからやり直します。この分岐は銀行の説明に基づいています。今回の実機で確認したのは「証明書の変更」を使う手順です。[りそな銀行の画面付き手順](https://www.resonabank.co.jp/hojin/b_direct/security/syoumei_saisentaku.html)・[大分銀行の画面付き手順（PDF）](https://www.oitabank.co.jp/business/businessdirect/pdf/densisyoumei.pdf)

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

拡張機能は端末内の登録保存、補助アプリとの通信、利用者が開いたタブでの照合に必要な権限を使います。照合するのは、拡張ボタンを押したタブのうち登録した銀行と接続先が一致するページだけです。取引の本文や Cookie は読まず、照合結果は保存しません。[Chrome の一時的なタブ権限](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)・[Chrome の Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)

### 試用版の更新・削除

新版が出たら、同じダウンロードリンクからインストーラーを開きます。設定ガイドから Chrome の拡張機能画面を開き、「法人別 証明書切替」のカードにある再読み込みボタンを押してください。登録した法人と専用ウィンドウの保存先を引き継げます。

試用版を削除するには、Chrome の拡張機能画面で「法人別 証明書切替」の「削除」を押してください。次に Windows の「設定」→「アプリ」→「インストールされているアプリ」から同じ名前のアプリをアンインストールします。拡張機能を削除すると、登録した法人と証明書の組み合わせは消えます。Windows の証明書と法人用の Chrome プロファイルはそのままです。[Chrome のローカル保存の仕様](https://developer.chrome.com/docs/extensions/reference/api/storage#storage-areas)

## 検証結果

2026年11月20日、Windows 11 Pro 上の通常版 Chrome 157.0.8103.40 と Edge 157.0.4341.42 で、端末内の相互 TLS サーバーに接続しました。Windows の個人ストアに試験用のA社・B社の証明書を登録し、サーバーが受け取った証明書の SHA-256 指紋を照合しました。

| 同じタブ・同じウィンドウでの操作 | サーバーと画面で確かめたこと |
| --- | --- |
| Chrome でA社を選んだ後、拡張ボタンで同じ認証先のB社用URLを開く | URLのパスは変わり、サーバーは再びAを受信。指紋を通知したページでは拡張画面にA社と選択の不一致を表示 |
| Chrome で Cookie とキャッシュの消去を指示する応答を受け、同じ認証先に接続する | 試験 Cookie は消えたが、サーバーはAを受信。指紋を通知しないページの表示は「未確認」 |
| Chrome で別のホスト名へ移りBを選び、元の接続先に戻る | 別のホストではBを受信。元のホストでは再びAを受信 |
| Edge でサイト情報の「証明書の変更」からAをBに変更する | 同じURLで、新しいウィンドウやタブは増えず、サーバーの受信は A → B。Edge のサイト情報の名義も A → B |

これらの試験では毎回 TLS 接続を張り直し、セッションを再開していないこともサーバーで確認しました。Chrome の同一タブではツールバーから実際に拡張機能を開き、手入力の照合が接続先の通知を書き換えないことも確かめました。

#### 接続先からの通知方法（開発者向け）

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

v0.2.0 では管理者権限のない Windows ユーザーで配布用 EXE の新規導入、上書き、削除を試験しました。v0.3.0 ではインストーラーから展開した拡張機能の全ファイルをソースと照合し、通常版 Chrome 157 の試験用プロファイルで同じタブの起動・照合を試験しました。この PC には旧版が導入済みのため、最新版のインストール・アンインストールの再試験は行っていません。

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
