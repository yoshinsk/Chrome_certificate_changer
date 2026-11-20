# native/Install.ps1 | Windows 標準の C# コンパイラで補助アプリを作り、現在の利用者に登録する。
[CmdletBinding()]
param([switch]$BuildOnly, [string]$OutputDirectory = (Join-Path $env:LOCALAPPDATA 'ChromeCertificateChanger\host'))
$ErrorActionPreference = 'Stop'
$hostName = 'jp.chrome_certificate_changer.host'
$registry = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$dest = [IO.Directory]::CreateDirectory($OutputDirectory).FullName
$binary = Join-Path $dest 'CertificateHost.exe'

# 既存の登録を保ったまま再コンパイルできるよう、一時ファイルへのビルド成功後に配置する。
$tempBinary = Join-Path $dest ("build-{0}.exe" -f [guid]::NewGuid())
try {
    & $compiler /nologo /target:exe /platform:anycpu /codepage:65001 /r:System.Web.Extensions.dll "/out:$tempBinary" (Join-Path $PSScriptRoot 'CertificateHost.cs') (Join-Path $PSScriptRoot 'ChromeBrowser.cs')
    if ($LASTEXITCODE -ne 0) { throw '補助アプリのビルドに失敗しました。' }
    [IO.File]::Copy($tempBinary, $binary, $true)
} finally {
    if ([IO.File]::Exists($tempBinary)) { [IO.File]::Delete($tempBinary) }
}
if ($BuildOnly) { Write-Output $binary; return }

# Windows はマニフェストを基準に相対パスを解決する。配布版と同じ固定ID・許可範囲を使う。
$manifestPath = Join-Path $dest 'host.json'
[IO.File]::Copy((Join-Path $PSScriptRoot 'host.json'), $manifestPath, $true)
New-Item -Path $registry -Force | Out-Null
Set-Item -LiteralPath $registry -Value $manifestPath
Write-Output "補助アプリを登録しました。 $binary"
