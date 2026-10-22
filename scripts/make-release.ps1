# Builds the desktop app (one .exe with the web app embedded) and lays out a portable copy:
#   powershell -ExecutionPolicy Bypass -File scripts\make-release.ps1            -> Releases\DaggerfallInteractiveMap-<v>\ (+ zip)
#   powershell -ExecutionPolicy Bypass -File scripts\make-release.ps1 -Personal  -> Personal\ (your copy)
# A copy is just "Daggerfall Interactive Map.exe" + README.txt; the app creates data\ beside the exe for
# its notes. Rebuilding over an existing folder never touches data\.
param([switch]$Personal)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$name = "DaggerfallInteractiveMap-$version"
$out = if ($Personal) { Join-Path $Root 'Personal' } else { Join-Path $Root "Releases\$name" }
$commit = (git rev-parse --short HEAD 2>$null)
$dirty = if (git status --porcelain 2>$null) { '+local changes' } else { '' }

# The app must not be running while its exe is replaced.
$running = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith("$out\") -and $_.Path.EndsWith('.exe') }
if ($running) { throw "Close the companion running from $out first." }

Write-Host "Building $name ($commit$dirty)"
& npx.cmd tauri build --no-bundle
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
$exe = Join-Path $Root 'src-tauri\target\release\daggerfall-interactive-map.exe'

New-Item -ItemType Directory -Force -Path $out | Out-Null
Get-ChildItem $out -Exclude data, README.md | Remove-Item -Recurse -Force
Copy-Item $exe (Join-Path $out 'Daggerfall Interactive Map.exe')
(Get-Content 'release\README.txt' -Raw).Replace('{{VERSION}}', "v$version ($commit$dirty, $(Get-Date -Format yyyy-MM-dd))") |
  Set-Content -Path (Join-Path $out 'README.txt') -Encoding UTF8

if ($Personal) { Write-Host "Updated personal copy: $out"; exit 0 }

# Shareable zip: never includes a data/ folder.
$zip = Join-Path $Root "Releases\$name.zip"
if (Test-Path $zip) { Remove-Item $zip }
$stage = Join-Path $env:TEMP "dfc-release-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path "$stage\$name" | Out-Null
Get-ChildItem $out -Exclude data | Copy-Item -Destination "$stage\$name" -Recurse
Compress-Archive -Path "$stage\$name" -DestinationPath $zip
Remove-Item $stage -Recurse -Force

Write-Host "Done:"
Write-Host "  folder  $out"
Write-Host "  zip     $zip  (no personal data)"
