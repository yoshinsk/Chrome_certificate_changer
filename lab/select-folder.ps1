# lab/select-folder.ps1 | 試験が起動した Chrome のフォルダー選択画面に、配布版の実際の保存先を入力する。
param([Parameter(Mandatory)][int]$BrowserPid)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FolderDialog {
    // Windows の標準フォルダー選択画面の子コントロールを、そのダイアログ内に限定して取得する。
    [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr dialog, int number);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)]
    public static extern IntPtr SendMessageTimeout(IntPtr h, uint message, IntPtr w, string value,
        uint flags, uint milliseconds, out IntPtr result);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint message, IntPtr w, IntPtr l);
}
'@
$folder = (Get-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'ChromeCertificateChanger\program\extension')).FullName
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$BrowserPid"
$prefix = [regex]::Escape((Join-Path ([IO.Path]::GetTempPath()) 'ccc-panel-'))
if ($process.Name -ne 'chrome.exe' -or $process.CommandLine -notmatch $prefix) { throw '試験用 Chrome の PID を指定してください。' }
$root = [Windows.Automation.AutomationElement]::RootElement
$scope = [Windows.Automation.TreeScope]
$owner = [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ProcessIdProperty,$BrowserPid)
$isDialog = [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ClassNameProperty,'#32770')
$deadline = [DateTime]::UtcNow.AddSeconds(15)
while ([DateTime]::UtcNow -lt $deadline) {
    foreach ($window in $root.FindAll($scope::Children, $owner)) {
        $dialog = if ($window.Current.ClassName -eq '#32770') { $window } else { $window.FindFirst($scope::Descendants,$isDialog) }
        if (!$dialog) { continue }
        $handle = [IntPtr]$dialog.Current.NativeWindowHandle
        $inputHandle = [FolderDialog]::GetDlgItem($handle, 1152)
        $okHandle = [FolderDialog]::GetDlgItem($handle, 1)
        if ($inputHandle -ne [IntPtr]::Zero -and $okHandle -ne [IntPtr]::Zero) {
            # 手順書の貼り付け先と同じ入力欄を使う。利用者のクリップボードには触れない。
            $written = [IntPtr]::Zero
            $sent = [FolderDialog]::SendMessageTimeout($inputHandle, 0x000C, [IntPtr]::Zero, $folder, 2, 2000, [ref]$written)
            if ($sent -eq [IntPtr]::Zero -or $written -eq [IntPtr]::Zero) { throw 'フォルダーの場所を入力できません。' }
            if (![FolderDialog]::PostMessage($okHandle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)) { throw 'フォルダーを選択できません。' }
            return
        }
    }
    Start-Sleep -Milliseconds 150
}
throw '試験用のフォルダー選択画面で入力欄を確認できません。'
