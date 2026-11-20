# lab/picker.ps1 | 試験専用の Chrome プロセスで合成証明書を選び、通常の選択画面を操作する。
[CmdletBinding()]
param([Parameter(Mandatory)][int]$BrowserPid,
      [Parameter(Mandatory)][ValidatePattern('^CCC-[AB]-[a-f0-9]{12}$')][string]$CommonName,
      [Parameter(Mandatory)][ValidatePattern('^[0-9a-fA-F]+$')][string]$Serial, [switch]$Cancel)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$root = [Windows.Automation.AutomationElement]::RootElement
$scope = [Windows.Automation.TreeScope]
$condition = [Windows.Automation.PropertyCondition]::new(
    [Windows.Automation.AutomationElement]::ProcessIdProperty, $BrowserPid)
$all = [Windows.Automation.Condition]::TrueCondition
$selection = [Windows.Automation.SelectionItemPattern]::Pattern
$invoke = [Windows.Automation.InvokePattern]::Pattern
$deadline = [DateTime]::UtcNow.AddSeconds(15)
$requested = $false
$stage = '名義を検索'
$buttonNames = if ($Cancel) { @('Cancel','キャンセル') } else { @('OK','選択','Select') }

# 名前とシリアルを含む試験行だけを選ぶ。既存の利用者のウィンドウにはキーを送らない。
while ([DateTime]::UtcNow -lt $deadline) {
    $visible = $false
    foreach ($window in $root.FindAll($scope::Children, $condition)) {
        $nodes = $window.FindAll($scope::Descendants, $all)
        $matches = @($nodes | Where-Object { $_.Current.Name -ceq $CommonName })
        if (!$matches) { continue }
        $visible = $true
        foreach ($node in $matches) {
            $stage = '同名の行でシリアル番号を照合'
            $row = [Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($node)
            $cells = $row.FindAll($scope::Children, $all)
            $serialCell = $cells | Where-Object { $_.Current.Name.Replace(':','').TrimStart('0') -ieq $Serial.TrimStart('0') }
            if (!$serialCell) { continue }
            $stage = '指定行を選択'
            # Chromium の表は「行」の既定操作で指定行を選択する。セルの Select は現在行を再選択する。
            $selected = $null
            if (!$row.TryGetCurrentPattern($selection, [ref]$selected) -or !$selected.Current.IsSelected) {
                $row.GetCurrentPattern($invoke).Invoke()
                continue
            }
            $stage = '確定ボタンを検索'
            $ok = $nodes | Where-Object { $_.Current.Name -in $buttonNames -and
                $_.Current.ControlType -eq [Windows.Automation.ControlType]::Button } | Select-Object -First 1
            if ($ok -and $ok.Current.IsEnabled) {
                # ダイアログ表示直後の誤操作を防ぐ Chrome の待ち時間を確保してから確定する。
                Start-Sleep -Milliseconds 900
                $ok.GetCurrentPattern($invoke).Invoke()
                $requested = $true
                $stage = '確定後の画面遷移を確認'
                break
            }
        }
    }
    if ($requested -and !$visible) { return }
    Start-Sleep -Milliseconds 300
}
throw "試験用 Chrome で証明書を選択できませんでした（$stage）。"
