# Daggerfall Companion launcher (Windows).
# Rebuilds when the source changed, serves the built app on a fixed local port in the background,
# and opens it in a Chrome/Edge app window. The fixed port keeps the browser's saved data
# (Atlas, profiles, remembered folders) in one place between launches.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Port = 5179
$Url = "http://localhost:$Port/"
$Log = Join-Path $env:TEMP 'daggerfall-companion.log'
Set-Location $Root

function Test-Up {
  try { Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1 | Out-Null; return $true } catch { return $false }
}

# First run: install dependencies.
if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
  & npm.cmd install *> $Log
}

# Rebuild if anything in src/ (or the config) is newer than the last build.
$built = Join-Path $Root 'dist\index.html'
$stale = -not (Test-Path $built)
if (-not $stale) {
  $stamp = (Get-Item $built).LastWriteTime
  $newer = Get-ChildItem -Path (Join-Path $Root 'src'), (Join-Path $Root 'index.html'), (Join-Path $Root 'vite.config.ts') -Recurse -File |
    Where-Object { $_.LastWriteTime -gt $stamp } | Select-Object -First 1
  $stale = $null -ne $newer
}
if ($stale) {
  # A running server would keep serving the old files from memory; restart it after building.
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'vite' -and $_.CommandLine -match "$Port" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  & npm.cmd run build *> $Log
  if ($LASTEXITCODE -ne 0) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("Build failed. See $Log", 'Daggerfall Companion') | Out-Null
    exit 1
  }
}

if (-not (Test-Up)) {
  Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'serve' -WorkingDirectory $Root -WindowStyle Hidden
  for ($i = 0; $i -lt 40 -and -not (Test-Up); $i++) { Start-Sleep -Milliseconds 250 }
}

$browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ }

if ($browsers) {
  Start-Process -FilePath $browsers[0] -ArgumentList "--app=$Url", '--window-size=1600,960'
} else {
  Start-Process $Url
}
