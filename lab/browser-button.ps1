# lab/browser-button.ps1 | 試験で起動したブラウザーのボタンを押し、サイト情報に表示された証明書の名義を照合する。
param([Parameter(Mandatory)][int]$BrowserPid, [Parameter(Mandatory)][string]$Profile,
      [Parameter(Mandatory)][ValidateSet('Site','Choices','ChangeCertificate','Change','ReadName','Extensions','Action')][string]$Operation,
      [ValidatePattern('^CCC-[AB]-[a-f0-9]{12}$')][string]$CommonName)
$ErrorActionPreference = 'Stop'
$rootPath = (Get-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'ChromeCertificateChanger\profiles')).FullName
$dir = Get-Item -LiteralPath $Profile
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$BrowserPid"
if ($dir.Parent.FullName -ne $rootPath -or $dir.Name -notmatch '^[0-9a-f-]{36}$' -or
    $process.Name -notin @('chrome.exe','msedge.exe') -or !$process.CommandLine.Contains($dir.FullName) -or
    !$process.CommandLine.Contains('--remote-debugging-port=0')) { throw '今回の試験用ブラウザーを指定してください。' }
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LabButton {
    // 座標のウィンドウが試験 PID のものと確認できた場合に限り、そのウィンドウへ直接クリックを送る。
    [StructLayout(LayoutKind.Sequential)] public struct Pt { public int X; public int Y; }
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Pt point);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int pid);
    [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr hwnd, ref Pt point);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd,int msg,IntPtr key,IntPtr point);
}
'@
$names = @{ Site=@('View site information','サイト情報を表示'); Choices=@('Your certificate choices','証明書の選択');
    ChangeCertificate=@('Change certificate','証明書の変更'); Change=@('Change','変更');
    Extensions=@('Extensions','拡張機能'); Action=@('法人別 証明書切替') }
$root = [Windows.Automation.AutomationElement]::RootElement
$scope = [Windows.Automation.TreeScope]
$all = [Windows.Automation.Condition]::TrueCondition
$owner = [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ProcessIdProperty,$BrowserPid)
$deadline = [DateTime]::UtcNow.AddSeconds(9)
while ([DateTime]::UtcNow -lt $deadline) {
    foreach ($win in $root.FindAll($scope::Children,$owner)) {
        foreach ($node in $win.FindAll($scope::Descendants,$all)) {
            $n = $node.Current
            if ($Operation -eq 'ReadName') {
                # 銀行を模したページの本文を読まず、ブラウザーのサイト情報ダイアログ内のタイトルを確認する。
                if ($CommonName -and $n.ControlType -eq [Windows.Automation.ControlType]::TitleBar -and $n.Name -ceq $CommonName) { return }
                continue
            }
            if ($n.Name -notin $names[$Operation] -or !$n.IsEnabled -or $n.IsOffscreen) { continue }
            $invoke = $null
            if ($node.TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern,[ref]$invoke)) { $invoke.Invoke(); return }
            # 展開型のサイト情報ボタンでは、製品の UI と同じ場所を押す。別アプリが覆っている場合は待つ。
            $rect = $n.BoundingRectangle
            if ($rect.IsEmpty) { continue }
            $point = New-Object LabButton+Pt
            $point.X = [int]($rect.X + $rect.Width / 2)
            $point.Y = [int]($rect.Y + $rect.Height / 2)
            $handle = [LabButton]::WindowFromPoint($point)
            $pidAtPoint = 0
            $null = [LabButton]::GetWindowThreadProcessId($handle,[ref]$pidAtPoint)
            if ($pidAtPoint -ne $BrowserPid -or ![LabButton]::ScreenToClient($handle,[ref]$point)) { continue }
            $position = [IntPtr](($point.Y -shl 16) -bor ($point.X -band 65535))
            if ([LabButton]::PostMessage($handle,0x201,[IntPtr]1,$position) -and
                [LabButton]::PostMessage($handle,0x202,[IntPtr]0,$position)) { return }
        }
    }
    Start-Sleep -Milliseconds 150
}
throw "試験用ブラウザーで操作を確認できませんでした（$Operation）。"
