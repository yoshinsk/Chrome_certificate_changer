// native/CertificateHost.cs | Windows の既存証明書を読み取り、登録ごとの Chrome を起動する補助アプリ。
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Web.Script.Serialization;

internal static class CertificateHost
{
    internal const string Origin = "chrome-extension://aeieeneijdcmhecnfpddppnnlgbkopaj/";
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

    // Chrome は拡張機能のオリジンを第1引数に渡す。1要求に1応答を返し、標準出力を通信専用にする。
    public static int Main(string[] args)
    {
        if (args.Length == 0 || !String.Equals(args[0], Origin, StringComparison.Ordinal)) return 2;
        object response;
        try
        {
            using (var input = new BinaryReader(Console.OpenStandardInput()))
            {
                int size = input.ReadInt32();
                if (size < 2 || size > 32768) throw new InvalidDataException("要求の長さが不正です。");
                byte[] bytes = input.ReadBytes(size);
                if (bytes.Length != size) throw new EndOfStreamException("要求が途中で終了しました。");
                var message = Json.Deserialize<Dictionary<string, string>>(new UTF8Encoding(false, true).GetString(bytes));
                response = Dispatch(message);
            }
        }
        catch (Exception error)
        {
            response = new { ok = false, error = error.Message };
        }
        byte[] body = Encoding.UTF8.GetBytes(Json.Serialize(response));
        using (var output = new BinaryWriter(Console.OpenStandardOutput()))
        {
            output.Write(body.Length);
            output.Write(body);
        }
        return 0;
    }

    // 証明書の作成・削除・書き換えは要求の種類に含めない。起動時にも候補を再取得する。
    private static object Dispatch(Dictionary<string, string> message)
    {
        if (message == null || !message.ContainsKey("action")) throw new InvalidDataException("操作を指定してください。");
        switch (message["action"])
        {
            case "list":
                return new { ok = true, certificates = ReadCertificates() };
            case "open":
            case "renew":
                Guid id;
                if (!Guid.TryParseExact(message["id"], "D", out id)) throw new InvalidDataException("登録IDが不正です。");
                string url = LoginUrl(message["url"]);
                if (message["action"] == "open") RequireUsableCertificate(message["fingerprint"]);
                StartChrome(id, url);
                return new { ok = true, evidence = "unknown" };
            default:
                throw new InvalidDataException("この操作には対応していません。");
        }
    }

    // 通常ログインに必要な指紋と有効期間を照合する。更新窓口は旧証明書の期限切れでも開ける。
    private static void RequireUsableCertificate(string fingerprint)
    {
        var selected = ReadCertificates().Find(c => c.fingerprint == fingerprint);
        if (selected == null || !selected.IsValid(DateTime.UtcNow))
            throw new InvalidOperationException("登録証明書が見つからないか、有効期間外です。銀行の通常の方法で更新し、一覧から新しい証明書を登録してください。");
    }

    // Windows 版 Chrome が参照する現在のユーザーの個人ストアを、既存・読み取り専用で開く。
    // 更新元の証明書や秘密鍵に手を加えず、証明書全体の SHA-256 で新旧を区別する。
    private static List<CertificateInfo> ReadCertificates()
    {
        var result = new List<CertificateInfo>();
        using (var store = new X509Store(StoreName.My, StoreLocation.CurrentUser))
        using (var sha = SHA256.Create())
        {
            store.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly);
            foreach (X509Certificate2 cert in store.Certificates)
            {
                using (cert)
                {
                    if (!cert.HasPrivateKey || !SupportsClientAuth(cert)) continue;
                    result.Add(new CertificateInfo {
                        fingerprint = BitConverter.ToString(sha.ComputeHash(cert.RawData)).Replace("-", ""),
                        name = cert.GetNameInfo(X509NameType.SimpleName, false),
                        subject = cert.Subject, issuer = cert.Issuer, serial = cert.SerialNumber,
                        from = cert.NotBefore.ToUniversalTime().ToString("o"),
                        to = cert.NotAfter.ToUniversalTime().ToString("o")
                    });
                }
            }
        }
        return result.OrderBy(c => c.name).ThenByDescending(c => c.to).ToList();
    }

    // EKU や Key Usage がない証明書も候補になり得る。最終候補は接続先の要求に従って Chrome が選ぶ。
    private static bool SupportsClientAuth(X509Certificate2 cert)
    {
        var usage = cert.Extensions.OfType<X509KeyUsageExtension>().FirstOrDefault();
        if (usage != null && (usage.KeyUsages & X509KeyUsageFlags.DigitalSignature) == 0) return false;
        var eku = cert.Extensions.OfType<X509EnhancedKeyUsageExtension>().FirstOrDefault();
        return eku == null || eku.EnhancedKeyUsages.Cast<Oid>().Any(oid =>
            oid.Value == "1.3.6.1.5.5.7.3.2" || oid.Value == "2.5.29.37.0");
    }

    // シェルを介さず Chrome に単一の HTTPS URL を渡す。引用符とバックスラッシュは受け付けない。
    private static string LoginUrl(string value)
    {
        Uri url;
        if (String.IsNullOrEmpty(value) || value.Length > 4096 || value.Any(Char.IsWhiteSpace) ||
            value.Any(Char.IsControl) || value.IndexOfAny(new[] {'"', '\\'}) >= 0 ||
            !Uri.TryCreate(value, UriKind.Absolute, out url) || url.Scheme != Uri.UriSchemeHttps ||
            url.Host.Length == 0 || url.UserInfo.Length != 0)
            throw new InvalidDataException("認証情報を含まない HTTPS のURLを指定してください。");
        return url.AbsoluteUri;
    }

    // 同じ用途では証明書更新後も同じディレクトリを使い、銀行の Cookie や更新用の設定を維持する。
    private static void StartChrome(Guid id, string url)
    {
        var roots = new[] { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) };
        string chrome = roots.Select(root => Path.Combine(root, @"Google\Chrome\Application\chrome.exe")).FirstOrDefault(File.Exists);
        if (chrome == null) throw new FileNotFoundException("Google Chrome が見つかりません。");
        string profile = Path.Combine(roots[2], "ChromeCertificateChanger", "profiles", id.ToString("D"));
        Directory.CreateDirectory(profile);
        string arguments = "--user-data-dir=\"" + profile + "\" --no-first-run --no-default-browser-check " +
            "--disable-background-mode --new-window \"" + url + "\"";
        // Chrome による Native Messaging ホスト終了後も、専用のブラウザは利用者が閉じるまで維持する。
        using (Process.Start(new ProcessStartInfo(chrome, arguments) { UseShellExecute = true })) { }
    }

    // シリアル化するのは公開証明書の情報だけ。秘密鍵ハンドルの取得や署名は Chrome に任せる。
    private sealed class CertificateInfo
    {
        public string fingerprint, name, subject, issuer, serial, from, to;

        public bool IsValid(DateTime utcNow)
        {
            return DateTime.Parse(from, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind) <= utcNow &&
                utcNow < DateTime.Parse(to, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);
        }
    }
}
