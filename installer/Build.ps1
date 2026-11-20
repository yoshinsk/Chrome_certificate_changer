# installer/Build.ps1 | Windows 標準の C# コンパイラと NSIS 3 で、現在の版の日本語インストーラーを作る。
[CmdletBinding()]
param([string]$MakeNsis = 'makensis.exe', [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\dist'))
$ErrorActionPreference = 'Stop'
$root = (Get-Item -LiteralPath (Join-Path $PSScriptRoot '..')).FullName
$manifest = Get-Content -LiteralPath (Join-Path $root 'extension\manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw '拡張機能の版番号を確認してください。' }
# Windows の数値版と、Chrome と利用者に見せるプレリリースを含む版名を同じ設定から取得する。
$displayVersion = if ($manifest.version_name) { $manifest.version_name } else { $version }
$nsis = (Get-Command $MakeNsis -CommandType Application -ErrorAction Stop).Source
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$out = [IO.Directory]::CreateDirectory($OutputDirectory).FullName
$payload = [IO.Directory]::CreateDirectory((Join-Path ([IO.Path]::GetTempPath()) ('ccc-package-' + [guid]::NewGuid()))).FullName
try {
    # 補助アプリは検証時と同じビルドを使う。利用者のPCにはコンパイラやスクリプトを配らない。
    & (Join-Path $root 'native\Install.ps1') -BuildOnly -OutputDirectory $payload | Out-Null
    & $compiler /nologo /target:winexe /platform:anycpu /codepage:65001 /r:System.Windows.Forms.dll /r:System.Drawing.dll "/out:$payload\Guide.exe" (Join-Path $PSScriptRoot 'Guide.cs') (Join-Path $root 'native\ChromeBrowser.cs')
    if ($LASTEXITCODE) { throw '設定ガイドのビルドに失敗しました。' }
    $name = 'ChromeCertificateChanger-Setup.exe'
    & $nsis /V2 /INPUTCHARSET UTF8 "/DVERSION=$version" "/DDISPLAYVERSION=$displayVersion" "/DROOT=$root" "/DPAYLOAD=$payload" "/DOUTPUT=$payload\$name" (Join-Path $PSScriptRoot 'Setup.nsi')
    if ($LASTEXITCODE) { throw 'インストーラーのビルドに失敗しました。' }
    [IO.File]::Copy((Join-Path $payload $name), (Join-Path $out $name), $true)
    Write-Output (Join-Path $out $name)
} finally {
    # 今回生成した既知のファイルだけを削除する。開発者の作業フォルダーは対象に含めない。
    foreach ($name in @('CertificateHost.exe','Guide.exe','ChromeCertificateChanger-Setup.exe')) {
        [IO.File]::Delete((Join-Path $payload $name))
    }
    [IO.Directory]::Delete($payload)
}
