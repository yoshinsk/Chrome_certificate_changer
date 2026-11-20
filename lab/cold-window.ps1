# lab/cold-window.ps1 | 補助アプリ終了後も新規の試験用ウィンドウが残ることを確かめ、そのウィンドウだけを閉じる。
param([Parameter(Mandatory)][Guid]$Id, [switch]$CleanupOnly)
$ErrorActionPreference = 'Stop'
$profile = Join-Path $env:LOCALAPPDATA "ChromeCertificateChanger\profiles\$($Id.ToString('D'))"
$argument = [regex]::Escape($profile) + '(?:"|\s|$)'
$deadline = [DateTime]::UtcNow.AddSeconds(10)
do {
    $owned = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object {
        $_.CommandLine -match $argument -and $_.CommandLine -notmatch '--type='
    })
    if ($owned.Count -gt 0 -or $CleanupOnly) { break }
    Start-Sleep -Milliseconds 250
} while ([DateTime]::UtcNow -lt $deadline)
if ($CleanupOnly -and $owned.Count -eq 0) { return }
if ($owned.Count -ne 1) { throw '補助アプリ終了後に試験用 Chrome の起動を確認できません。' }
$process = Get-Process -Id $owned[0].ProcessId
try {
    # プロセス作成直後の瞬間だけを成功に数えず、ウィンドウが応答するまで待つ。
    if (!$process.WaitForInputIdle(7000)) { throw '試験ウィンドウが応答しません。' }
    for ($i = 0; $i -lt 25 -and !$process.MainWindowHandle; $i++) { Start-Sleep -Milliseconds 200; $process.Refresh() }
    if (!$process.MainWindowHandle) { throw '試験用 Chrome のウィンドウが見つかりません。' }
    Write-Output '補助アプリの終了後も、新しい専用ウィンドウが開いています。'
} finally {
    if (!$process.HasExited) {
        $null = $process.CloseMainWindow()
        if (!$process.WaitForExit(5000)) { & taskkill /pid $process.Id /t /f | Out-Null }
    }
}
