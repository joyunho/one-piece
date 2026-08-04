@echo off
git pull
if errorlevel 1 (
  echo git pull failed - check network or git install
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\desktop_install.ps1"
pause
