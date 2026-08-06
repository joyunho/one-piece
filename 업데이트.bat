@echo off
rem v20.3.0: pull the exact published branch and stop on divergence -
rem a silent no-op pull left an old install in place.
git pull --ff-only origin main
if errorlevel 1 (
  echo git pull failed - check network or git install
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\desktop_install.ps1"
pause
