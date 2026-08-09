# ORD 악몽 코치 — 바탕화면 설치 스크립트 (Windows)
# 사용법: 저장소 루트의 '바탕화면에_설치.bat' 더블클릭 (git 불필요).
# 하는 일: Node 확인(없으면 winget 설치) -> exe 빌드 -> 바탕화면 복사 -> 바로가기.
$ErrorActionPreference = 'Stop'
$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $toolsDir
$desktopSrc = Join-Path $repo 'desktop'

Write-Host '=== ORD 악몽 코치 — 바탕화면 설치 ==='

# v21.5.0: 무엇을 설치하는지 먼저 말한다.  실사례 — 예전 ZIP 폴더에서
# 이 스크립트를 돌리면 옛 코드가 그대로 다시 빌드돼 바탕화면 앱이 계속
# 옛 버전으로 남는다.  스크립트는 성공했다고 말하므로 사용자는 원인을
# 알 수 없었다("계속 20.4 인데? 병합이 안된건가?").
$manifestPath = Join-Path $repo 'ord_tmo_auto_extension_v15_0_0_rebuild\manifest.json'
$srcVersion = (Get-Content $manifestPath -Raw | ConvertFrom-Json).version
Write-Host ('설치할 폴더 : ' + $repo)
Write-Host ('설치할 버전 : v' + $srcVersion)
$head = & git -C $repo log --oneline -1 2>$null
if ($LASTEXITCODE -eq 0 -and $head) { Write-Host ('커밋        : ' + $head) }
else { Write-Host '커밋        : (git 저장소가 아님 - ZIP 설치본입니다. 최신인지 확인하세요)' }
Write-Host ''

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
# v21.5.0 보강: 코치가 켜져 있으면 exe가 잠겨 교체가 실패하고 예전
# 버전이 그대로 남는다("예전 버전이 설치되는데?" 실사례) — 실행 중인
# 코치를 먼저 조용히 종료한다.
# v21.5.0: taskkill 은 대상이 없으면 stderr 로 "프로세스를 찾을 수 없습니다"
# 를 쓰고, PowerShell 은 그걸 NativeCommandError 로 빨갛게 토해낸다
# ($ErrorActionPreference='Stop' 이라 더 무섭게 보인다).  2>$null 로도 안
# 막힌다 — 네이티브 stderr 는 리디렉션 대상이 아니라 오류 레코드로 승격되기
# 때문이다.  실사례: 설치가 다 끝난 뒤 이 빨간 덩어리만 보고 실패로 읽었다.
# 코치가 꺼져 있는 것은 정상이므로, 켜져 있을 때만 순수 PowerShell 로 끈다.
$running = Get-Process -Name ORDCoach -ErrorAction SilentlyContinue
if ($running) {
  Write-Host '실행 중인 코치를 종료합니다...'
  $running | Stop-Process -Force
  Start-Sleep -Milliseconds 700
}
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
$ver = (Get-Content (Join-Path $desktopSrc 'package.json') -Raw | ConvertFrom-Json).version
Write-Host ('설치 완료: ' + $target + ' (코치 v' + $ver + ')')
Write-Host ('창 제목에 v' + $ver + ' 가 보이지 않으면 옛 창이 그대로 열려 있는 것입니다 - 닫고 다시 여세요.')
Write-Host '바탕화면의 "ORD 악몽 코치" 바로가기로 실행하세요.'
Write-Host '(TMO.GG 데스크톱 프로그램을 먼저 켜 두세요 — 게임 중 F8 = 오버레이)'
