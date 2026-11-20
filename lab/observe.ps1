# lab/observe.ps1 | 合成サーバーとの TLS 1.3 接続だけを照合し、Chrome が送信用に組み立てた公開証明書の指紋を返す。
[CmdletBinding()]
param([Parameter(Mandatory)][string]$LabDirectory,
      [Parameter(Mandatory)][ValidatePattern('^[A-F0-9]{64}$')][string]$ServerFingerprint,
      [Parameter(Mandatory)][ValidatePattern('^CCC Lab [0-9a-f]{12}$')][string]$IssuerName)
$ErrorActionPreference = 'Stop'

# 試験プログラムが一時領域に出力したファイルだけを扱い、通信内容や証明書の本文は出力しない。
$directory = Get-Item -LiteralPath $LabDirectory
if ($directory.Parent.FullName.TrimEnd('\') -ine [IO.Path]::GetTempPath().TrimEnd('\') -or
    $directory.Name -notmatch '^ccc-evidence-[a-z0-9_-]+$') { throw '試験用の一時フォルダーを指定してください。' }
$file = Get-Item -LiteralPath (Join-Path $directory.FullName 'loopback.json')
if ($file.Length -gt 16MB) { throw '試験ログがサイズの上限を超えました。' }
$log = [IO.File]::ReadAllText($file.FullName) | ConvertFrom-Json
$types = $log.constants.logEventTypes
$phases = $log.constants.logEventPhase
$sha = [Security.Cryptography.SHA256]::Create()

function Get-Fingerprint([byte[]]$Der) {
    # Windows のストアや登録時の期待値を調べず、メッセージに含まれる証明書の DER 全体を識別する。
    return [BitConverter]::ToString($sha.ComputeHash($Der)).Replace('-','')
}

function Read-Length24([byte[]]$Bytes, [int]$At) {
    return 65536 * [int]$Bytes[$At] + 256 * [int]$Bytes[$At + 1] + $Bytes[$At + 2]
}

function Get-Leaf([string]$Encoded) {
    # この試験では初回 TLS 1.3 の非圧縮 Certificate に限る。空のリストや未対応形式は判定しない。
    if (!$Encoded) { return }
    $bytes = [Convert]::FromBase64String($Encoded)
    if ($bytes.Length -lt 13 -or $bytes[0] -ne 11 -or $bytes[4] -ne 0 -or
        (Read-Length24 $bytes 1) -ne $bytes.Length - 4 -or
        (Read-Length24 $bytes 5) -ne $bytes.Length - 8) { return }
    $size = Read-Length24 $bytes 8
    if ($size -le 0 -or $size -gt $bytes.Length - 13) { return }
    $der = [byte[]]::new($size)
    [Array]::Copy($bytes, 11, $der, 0, $size)
    $leaf = [Security.Cryptography.X509Certificates.X509Certificate2]::new($der)
    try { if ($leaf.Issuer -ceq "CN=$IssuerName") { Get-Fingerprint $der } } finally { $leaf.Dispose() }
}

try {
    # 毎回発行する検証サーバーの証明書からソケットを絞り込む。別のソケットの送信イベントを混ぜない。
    $peers = @{}
    foreach ($event in $log.events) {
        if ($event.type -ne $types.SSL_CERTIFICATES_RECEIVED -or
            $event.source.type -ne $log.constants.logSourceType.SOCKET -or !$event.params.certificates) { continue }
        $pem = $event.params.certificates[0] -replace '-----[^-]+-----|\s', ''
        if ((Get-Fingerprint ([Convert]::FromBase64String($pem))) -ceq $ServerFingerprint) {
            $peers[[string]$event.source.id] = $true
        }
    }
    $leaves = @()
    $messages = 0
    $unresolved = 0
    $events = $log.events | Where-Object { $_.source.type -eq $log.constants.logSourceType.SOCKET -and
        $peers.ContainsKey([string]$_.source.id) }
    foreach ($socket in ($events | Group-Object { $_.source.id })) {
        # TLS 1.3 が完了したソケットの送信イベントだけを使う。再開や取り消しから前回の指紋を推定しない。
        $connected = @($socket.Group | Where-Object { $_.type -eq $types.SSL_CONNECT -and
            $_.phase -eq $phases.PHASE_END -and $_.params.version -eq 'TLS 1.3' -and
            $_.params.is_resumed -is [bool] -and !$_.params.is_resumed })
        if (!$connected.Count) { continue }
        $sent = @($socket.Group | Where-Object { $_.type -eq $types.SSL_HANDSHAKE_MESSAGE_SENT -and $_.params.type -eq 11 })
        if (!$sent.Count) { $unresolved++ }
        foreach ($record in $sent) {
            $messages++
            $hash = Get-Leaf $record.params.bytes
            if ($hash) { $leaves += $hash } else { $unresolved++ }
        }
    }
    $distinct = @($leaves | Select-Object -Unique)
    $result = if (!$unresolved -and $distinct.Count -eq 1) { $distinct[0] } else { $null }
    [ordered]@{fingerprint=$result; messages=$messages; peers=$peers.Count} | ConvertTo-Json -Compress
} finally { $sha.Dispose() }
