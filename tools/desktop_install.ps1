# ORD 악몽 코치 — 바탕화면 설치 스크립트 (Windows)
# 사용법: 저장소 루트의 '바탕화면에_설치.bat' 더블클릭 (git 불필요).
# 하는 일: Node 확인(없으면 winget 설치) -> exe 빌드 -> 바탕화면 복사 -> 바로가기.
$ErrorActionPreference = 'Stop'
$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $toolsDir
$desktopSrc = Join-Path $repo 'desktop'

Write-Host '=== ORD 악몽 코치 — 바탕화면 설치 ==='

# 1) Node.js 확인 — 없으면 winget으로 LTS 설치
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host 'Node.js가 없어 winget으로 설치합니다 (1~2분)...'
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  $env:Path = "$env:ProgramFiles\nodejs;$env:Path"
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { throw 'Node.js 설치에 실패했습니다 — https://nodejs.org 에서 LTS를 설치한 뒤 다시 실행하세요.' }
}
Write-Host ('Node ' + (& node --version))

# 2) 의존성 설치 + Windows exe 빌드
Set-Location $desktopSrc
if (-not (Test-Path (Join-Path $desktopSrc 'node_modules'))) {
  & npm install
  if ($LASTEXITCODE -ne 0) { throw 'npm install 실패 — 인터넷 연결을 확인하세요.' }
}
& npm run dist:win
if ($LASTEXITCODE -ne 0) { throw 'exe 빌드 실패 — 위 오류 메시지를 확인하세요.' }

# 3) 바탕화면으로 복사 (OneDrive 바탕화면 리디렉션 대응)
$desk = [Environment]::GetFolderPath('Desktop')
$target = Join-Path $desk 'ORD악몽코치'
$built = Join-Path $desktopSrc 'dist\ORDCoach-win32-x64'
try {
  if (Test-Path $target) { Remove-Item -Recurse -Force $target }
  Copy-Item -Recurse -Force $built $target
} catch {
  throw ('바탕화면 복사 실패 — 코치가 실행 중이면 끄고 다시 시도하세요. (' + $_.Exception.Message + ')')
}

# 4) 바로가기 생성
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desk 'ORD 악몽 코치.lnk'))
$shortcut.TargetPath = (Join-Path $target 'ORDCoach.exe')
$shortcut.WorkingDirectory = $target
$shortcut.Save()

Write-Host ''
Write-Host ('설치 완료: ' + $target)
Write-Host '바탕화면의 "ORD 악몽 코치" 바로가기로 실행하세요.'
Write-Host '(TMO.GG 데스크톱 프로그램을 먼저 켜 두세요 — 게임 중 F8 = 오버레이)'
