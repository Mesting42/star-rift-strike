param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw '请先安装 Node.js 22.12 或更新版本。'
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules/vite/bin/vite.js'))) {
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络后重试。' }
}
function Test-GameServer([int]$GamePort) {
  try {
    $gameResponse = Invoke-WebRequest -Uri "http://127.0.0.1:$GamePort/" -UseBasicParsing -TimeoutSec 2
    return $gameResponse.StatusCode -eq 200 -and $gameResponse.Content.Contains('STAR RIFT') -and $gameResponse.Content.Contains('touch-controls')
  } catch { return $false }
}

$gamePort = $null
$gameReady = $false
foreach ($candidatePort in @(5173, 5174)) {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $candidatePort -ErrorAction SilentlyContinue)
  $lanListener = $listeners | Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') }
  if ($lanListener -and (Test-GameServer $candidatePort)) {
    $gamePort = $candidatePort
    $gameReady = $true
    break
  }
}
if (-not $gameReady) {
  foreach ($candidatePort in @(5173, 5174)) {
    if (-not (Get-NetTCPConnection -State Listen -LocalPort $candidatePort -ErrorAction SilentlyContinue)) {
      $gamePort = $candidatePort
      break
    }
  }
  if (-not $gamePort) { throw '5173 和 5174 端口均已被占用。请关闭占用端口的服务后重试。' }
  $gameServer = Start-Process -FilePath (Get-Command node).Source -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', "$gamePort", '--strictPort') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    $gameReady = Test-GameServer $gamePort
    if ($gameReady) { break }
    if ($gameServer.HasExited) { throw '游戏服务启动失败。请在当前目录执行 npm run dev 查看详情。' }
  }
}
if (-not $gameReady) { throw '游戏服务未就绪。请在当前目录执行 npm run dev。' }
$gameAddress = "http://127.0.0.1:$gamePort/"
if (-not $NoBrowser) { Start-Process $gameAddress }
Write-Host "星隙突击已启动：$gameAddress"
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notlike '169.254*' } |
  ForEach-Object { Write-Host "同一 Wi-Fi 下的手机和平板可访问：http://$($_.IPAddress):$gamePort/" }
