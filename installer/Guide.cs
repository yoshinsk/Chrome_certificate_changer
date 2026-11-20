// installer/Guide.cs | Chrome への初回追加を日本語で案内し、設定後は登録画面を直接開く。
using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

internal sealed class Guide : Form
{
    private readonly string extensionFolder = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "extension");
    private readonly TextBox folder = new TextBox { ReadOnly = true, Dock = DockStyle.Fill };
    private readonly Label status = new Label { AutoSize = true, AccessibleRole = AccessibleRole.StatusBar };
    private const string PanelUrl = "chrome-extension://aeieeneijdcmhecnfpddppnnlgbkopaj/panel.html?tab";

    // クリップボードを使うため STA で起動する。ボタンはキーボードでも順番に操作できる。
    [STAThread]
    public static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (var guide = new Guide())
        {
            if (args.Length == 1 && args[0] == "--open") guide.OpenChrome(PanelUrl);
            else Application.Run(guide);
        }
    }

    // 一度だけ行う設定と、次回から開く画面を1枚にまとめ、フォルダーを手で探す作業を省く。
    private Guide()
    {
        Text = "法人別 証明書切替 の使い方";
        AutoScaleMode = AutoScaleMode.Dpi;
        Font = new Font("Yu Gothic UI", 10.5f);
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(610, 480);
        MinimumSize = new Size(490, 395);
        var content = new TableLayoutPanel { Dock = DockStyle.Fill, AutoScroll = true, ColumnCount = 1,
            Padding = new Padding(20), GrowStyle = TableLayoutPanelGrowStyle.AddRows };
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(content);
        var heading = AddText(content, "最初に、普段使う Chrome に追加します");
        heading.Font = new Font(Font.FontFamily, 15, FontStyle.Bold);
        AddText(content, "1. 下のボタンを押すと、フォルダーの場所をコピーして Chrome の拡張機能画面を開きます。");
        AddButton(content, "フォルダーの場所をコピーして Chrome を開く", CopyAndOpen);
        folder.Text = extensionFolder;
        folder.AccessibleName = "拡張機能のフォルダー";
        content.Controls.Add(folder);
        AddText(content, "すでに追加済みの方は、Chrome に表示された「法人別 証明書切替」の再読み込みボタンを押すと更新できます。");
        AddText(content, "2. Chrome の右上で「デベロッパー モード」をオンにし、左上の「パッケージ化されていない拡張機能を読み込む」を押します。");
        AddText(content, "3. 開いた画面の下にある「フォルダー」欄をクリックし、Ctrl キーを押しながら V を押して貼り付けます。「フォルダーの選択」を押してください。");
        var next = AddText(content, "追加できたら");
        next.Font = new Font(Font, FontStyle.Bold);
        AddButton(content, "法人の登録画面を開く", delegate { OpenChrome(PanelUrl); });
        AddText(content, "次回は Chrome の拡張機能メニュー、または Windows のスタートメニューから開けます。");
        AddText(content, "銀行のタブで使用証明書を確認するときは、Chrome 右上の拡張機能メニューから開いてください。");
        content.Controls.Add(status);
    }

    // 長い手順も横幅に合わせて折り返す。
    private static Label AddText(TableLayoutPanel panel, string text)
    {
        var label = new Label { Text = text, AutoSize = true, Dock = DockStyle.Fill, Margin = new Padding(0, 6, 0, 4) };
        panel.Controls.Add(label);
        return label;
    }

    // OS 標準のボタンを使い、フォーカス・読み上げ・高コントラストの設定を引き継ぐ。
    private static void AddButton(TableLayoutPanel panel, string text, EventHandler handler)
    {
        var button = new Button { Text = text, AutoSize = true, Padding = new Padding(7, 3, 7, 3),
            Margin = new Padding(0, 3, 0, 5) };
        button.Click += handler;
        panel.Controls.Add(button);
    }

    // コピーできないときは選択可能な場所の欄を残す。Chrome を開く直前にだけコピーする。
    private void CopyAndOpen(object sender, EventArgs args)
    {
        if (!File.Exists(Path.Combine(extensionFolder, "manifest.json")))
        {
            MessageBox.Show(this, "拡張機能のファイルが見つかりません。インストーラーをもう一度開いてください。", Text);
            return;
        }
        try
        {
            Clipboard.SetText(extensionFolder);
            status.Text = "フォルダーの場所をコピーしました。Chrome で手順 2 に進んでください。";
        }
        catch (ExternalException)
        {
            folder.Focus();
            folder.SelectAll();
            MessageBox.Show(this, "自動でコピーできませんでした。この画面のフォルダー欄から場所をコピーしてください。", Text);
        }
        OpenChrome("chrome://extensions/");
    }

    // 2つの固定 URL だけを通常の Chrome に渡す。新しいウィンドウや追加の権限は要求しない。
    private void OpenChrome(string url)
    {
        try { ChromeBrowser.Open("\"" + url + "\""); }
        catch (Exception error)
        { MessageBox.Show(this, error.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Information); }
    }
}
