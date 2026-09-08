param([switch]$Uninstall, [switch]$PrepareOnly, [string]$CodexPath)
$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskLocal = Join-Path $taskRoot '.local'
$taskManifestPath = Join-Path $taskLocal 'com.local.youtube_luna.json'
$taskRegistryPaths = @(
  'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.local.youtube_luna',
  'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.local.youtube_luna',
  'HKCU:\Software\Chromium\NativeMessagingHosts\com.local.youtube_luna'
)
if ($Uninstall) {
  foreach ($taskRegistryPath in $taskRegistryPaths) {
    if (Test-Path -LiteralPath $taskRegistryPath) {
      $taskRegistered = (Get-Item -LiteralPath $taskRegistryPath).GetValue('')
      if ($taskRegistered -eq $taskManifestPath) { Remove-Item -LiteralPath $taskRegistryPath }
    }
  }
  Write-Host 'Luna native host unregistered. Extension settings and project files were preserved.'
  exit 0
}
$taskNodePath = (Get-Command node.exe -ErrorAction Stop).Source
if (-not $CodexPath) {
  $taskCommand = Get-Command codex.exe -ErrorAction SilentlyContinue
  if ($taskCommand) { $CodexPath = $taskCommand.Source }
}
if (-not $CodexPath) {
  $taskCodexRoots = @((Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'), (Join-Path $env:APPDATA 'npm\node_modules\@openai'))
  foreach ($taskCodexRoot in $taskCodexRoots) {
    if (Test-Path -LiteralPath $taskCodexRoot) {
      $taskCandidate = Get-ChildItem -LiteralPath $taskCodexRoot -Filter codex.exe -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if ($taskCandidate) { $CodexPath = $taskCandidate.FullName; break }
    }
  }
}
if (-not $CodexPath -or -not (Test-Path -LiteralPath $CodexPath)) { throw 'Codex CLI not found. Install Codex CLI first, or pass -CodexPath C:\path\to\codex.exe.' }
$CodexPath = [System.IO.Path]::GetFullPath($CodexPath)
if ([System.IO.Path]::GetExtension($CodexPath) -ne '.exe') { throw 'Use the actual codex.exe path, not a PowerShell or npm shim.' }
foreach ($taskPath in @($taskRoot, $taskNodePath)) {
  if ($taskPath -match '[%"\r\n]') { throw 'Please use an installation folder without percent signs or quotes.' }
}
$taskMajorVersion = [int]((& $taskNodePath --version).TrimStart('v').Split('.')[0])
if ($taskMajorVersion -lt 22) { throw 'Node.js 22 or newer is required.' }
[System.IO.Directory]::CreateDirectory($taskLocal) | Out-Null
$taskEncoding = New-Object System.Text.UTF8Encoding($false)
$taskRuntime = @{ codexPath = $CodexPath } | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $taskLocal 'runtime.json'), $taskRuntime, $taskEncoding)
$taskLauncherPath = Join-Path $taskLocal 'native-host.cmd'
$taskLauncher = "@echo off`r`nchcp 65001 >nul`r`n`"$taskNodePath`" `"$taskRoot\native\host.mjs`"`r`n"
[System.IO.File]::WriteAllText($taskLauncherPath, $taskLauncher, $taskEncoding)
$taskManifest = @{
  name = 'com.local.youtube_luna'
  description = 'Luna YouTube English tutor using local Codex subscription login'
  path = $taskLauncherPath
  type = 'stdio'
  allowed_origins = @('chrome-extension://aeofkpgbodbdljhlibnnhbjkalpjenid/')
} | ConvertTo-Json
[System.IO.File]::WriteAllText($taskManifestPath, $taskManifest, $taskEncoding)
if (-not $PrepareOnly) {
  foreach ($taskRegistryPath in $taskRegistryPaths) {
    New-Item -Path $taskRegistryPath -Force | Out-Null
    Set-Item -LiteralPath $taskRegistryPath -Value $taskManifestPath
  }
}
Write-Host "Native host prepared: $taskManifestPath"
Write-Host "Codex CLI: $CodexPath"
Write-Host "Load unpacked extension folder: $taskRoot\extension"
Write-Host 'Expected extension ID: aeofkpgbodbdljhlibnnhbjkalpjenid'
Write-Host 'Run codex login with your ChatGPT account, then use Detect connection in the extension popup.'
if ($PrepareOnly) { Write-Host 'Registry registration skipped (-PrepareOnly).' }
