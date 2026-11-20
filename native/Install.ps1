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
    & $compiler /nologo /target:exe /platform:anycpu /codepage:65001 /r:System.Web.Extensions.dll "/out:$tempBinary" (Join-Path $PSScriptRoot 'CertificateHost.cs')
    if ($LASTEXITCODE -ne 0) { throw '補助アプリのビルドに失敗しました。' }
    [IO.File]::Copy($tempBinary, $binary, $true)
} finally {
    if ([IO.File]::Exists($tempBinary)) { [IO.File]::Delete($tempBinary) }
}
if ($BuildOnly) { Write-Output $binary; return }

# マニフェストの公開鍵と対応する固定IDだけに Native Messaging を許可する。
$manifestPath = Join-Path $dest 'host.json'
$manifest = [ordered]@{ name = $hostName; description = 'Windows client certificate launcher'; path = $binary; type = 'stdio'
    allowed_origins = @('chrome-extension://aeieeneijdcmhecnfpddppnnlgbkopaj/') }
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
New-Item -Path $registry -Force | Out-Null
Set-Item -LiteralPath $registry -Value $manifestPath
Write-Output "補助アプリを登録しました。 $binary"
