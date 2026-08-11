# ORD coach - ZIP updater for PCs without git (ASCII only - runs on any codepage).
# Called by update bat when git is missing: downloads the published main branch
# as a ZIP, copies it over the repo folder, then runs the normal installer.
# Runs from %TEMP% (the bat copies it there first) so it can freely overwrite
# every repo file, including the bat and this script's repo copy.
param([string]$Repo)
$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path $Repo).Path
Write-Host '=== ORD coach - ZIP update (no git on this PC) ==='
Write-Host ('Target folder : ' + $Repo)

# TLS 1.2 for Windows PowerShell 5.1 on older Windows builds.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072

$zip = Join-Path $env:TEMP 'ord-coach-main.zip'
$dst = Join-Path $env:TEMP 'ord-coach-main-zip'
Write-Host 'Downloading latest main.zip from GitHub...'
Invoke-WebRequest -Uri 'https://github.com/joyunho/one-piece/archive/refs/heads/main.zip' -OutFile $zip
if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
Expand-Archive -Path $zip -DestinationPath $dst -Force
$src = Join-Path $dst 'one-piece-main'
if (-not (Test-Path $src)) { throw 'ZIP layout unexpected - one-piece-main folder not found.' }

Write-Host 'Copying files over the repo folder...'
Copy-Item -Path (Join-Path $src '*') -Destination $Repo -Recurse -Force

Write-Host ''
& (Join-Path $Repo 'tools\desktop_install.ps1')
