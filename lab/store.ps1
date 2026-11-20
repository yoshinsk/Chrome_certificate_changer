# lab/store.ps1 | この試験で生成した証明書だけを現在のユーザーの個人ストアへ追加・撤去する。
[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('Add','Remove')][string]$Operation,
      [Parameter(Mandatory)][ValidatePattern('^[0-9A-F]{40}$')][string]$Thumbprint,
      [Parameter(Mandatory)][ValidatePattern('^[0-9A-F]{64}$')][string]$Fingerprint,
      [Parameter(Mandatory)][ValidatePattern('^CCC Lab [a-f0-9]{12}$')][string]$IssuerName,
      [string]$PfxPath)
$ErrorActionPreference = 'Stop'
$certPath = "Cert:\CurrentUser\My\$Thumbprint"

# SHA-1 は Windows のストアパスを引くためだけに使い、操作対象を発行者と SHA-256 で再確認する。
function Confirm-LabCertificate($Cert) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $actual = [BitConverter]::ToString($sha.ComputeHash($Cert.RawData)).Replace('-','') }
    finally { $sha.Dispose() }
    if ($Cert.Thumbprint -cne $Thumbprint -or $actual -cne $Fingerprint -or $Cert.Issuer -cne "CN=$IssuerName") {
        throw '試験で生成した証明書と一致しません。'
    }
}
if ($Operation -eq 'Remove') {
    if (Test-Path -LiteralPath $certPath) {
        Confirm-LabCertificate (Get-Item -LiteralPath $certPath)
        Remove-Item -LiteralPath $certPath -DeleteKey -Force
    }
    return
}
if (Test-Path -LiteralPath $certPath) { throw '既存の証明書と重複しています。' }
# PFX は毎回生成する合成データに限定する。パスワードはコマンド引数に渡さない。
$password = [Console]::In.ReadLine()
$preview = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
    $PfxPath, $password, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
try { Confirm-LabCertificate $preview } finally { $preview.Dispose() }
$secret = ConvertTo-SecureString -String $password -AsPlainText -Force
try { Import-PfxCertificate -FilePath $PfxPath -CertStoreLocation 'Cert:\CurrentUser\My' -Password $secret | Out-Null }
finally { $secret.Dispose() }
