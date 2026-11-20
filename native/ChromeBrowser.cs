// native/ChromeBrowser.cs | 補助アプリと導入ガイドから、Windows にインストール済みの通常版 Chrome を開く。
using System;
using System.Diagnostics;
using System.IO;

internal static class ChromeBrowser
{
    // 銀行との接続と初期設定で同じ製品を使う。既定ブラウザーや外部から指定された実行ファイルには委ねない。
    internal static void Open(string arguments)
    {
        var folders = new[] { Environment.SpecialFolder.ProgramFiles, Environment.SpecialFolder.ProgramFilesX86,
            Environment.SpecialFolder.LocalApplicationData };
        foreach (var folder in folders)
        {
            string file = Path.Combine(Environment.GetFolderPath(folder), @"Google\Chrome\Application\chrome.exe");
            if (!File.Exists(file)) continue;
            // Native Messaging の要求終了後も、利用者が閉じるまで Chrome を動かす。
            using (Process.Start(new ProcessStartInfo(file, arguments) { UseShellExecute = true })) { }
            return;
        }
        throw new FileNotFoundException("Google Chrome が見つかりません。インストールしてから、もう一度開いてください。");
    }
}
