@echo off
rem v21.0.0: run from this file's own folder, not the caller's.
rem The clone lives in %USERPROFILE%\one-piece, not on the Desktop - the
rem Desktop only holds the built app folder. Invoking this bat by full
rem path from any other folder used to run git pull outside the repo.
cd /d "%~dp0"
rem Pull the exact published branch and stop on divergence - a silent
rem no-op pull left an old install in place.
git pull --ff-only origin main
if errorlevel 1 (
  echo.
  echo git pull failed. Common causes:
  echo   - no network, or git is not installed
  echo   - local edits or a diverged branch ^(run: git status^)
  echo This folder: %CD%
  pause
  exit /b 1
)
rem Show what we are about to install, so "it still says the old version"
rem is answerable without guessing.
echo.
echo Installing this commit:
git --no-pager log --oneline -1
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\desktop_install.ps1"
pause
