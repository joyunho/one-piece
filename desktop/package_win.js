'use strict';
// Windows exe 패키징 — @electron/packager API 호출.
// 리눅스에서도 win32 대상 빌드가 된다(리소스 편집이 순수 JS(resedit)라
// wine 불필요).  출력: dist/ORDCoach-win32-x64/ORDCoach.exe
const path = require('path');
const {packager} = require('@electron/packager');

(async () => {
  const paths = await packager({
    dir: __dirname,
    out: path.join(__dirname, 'dist'),
    name: 'ORDCoach',
    executableName: 'ORDCoach',
    platform: 'win32',
    arch: 'x64',
    overwrite: true,
    asar: false,
    prune: true,
    // 앱에 실을 것: main.js / preload.js / package.json / ui/ 뿐.
    ignore: [
      /^\/dist($|\/)/,
      /^\/node_modules($|\/)/,
      /^\/build_ui\.js$/,
      /^\/package_win\.js$/,
      /^\/README\.md$/
    ],
    win32metadata: {
      ProductName: 'ORD 악몽 실전 판단 코치',
      FileDescription: 'ORD 2.310 악몽 실전 판단 코치 (데스크톱 셸)',
      CompanyName: 'ORD coach'
    }
  });
  console.log('빌드 완료:', paths.join(', '));
  // v19.14.1(사용자 요청): 어떤 경로로 빌드하든 결과물이 바탕화면에
  // 도착한다 — dist:win 직접 실행도, 설치·업데이트 bat 경유도 동일.
  // OneDrive 바탕화면 리디렉션 대응으로 GetFolderPath 를 쓴다.
  if (process.platform === 'win32') {
    const fs = require('fs');
    const {execSync} = require('child_process');
    let desktop = '';
    try { desktop = execSync('powershell -NoProfile -Command "[Environment]::GetFolderPath(\'Desktop\')"', {encoding: 'utf8'}).trim(); } catch (_) {}
    if (!desktop) desktop = path.join(require('os').homedir(), 'Desktop');
    const built = String(paths[0] || path.join(__dirname, 'dist', 'ORDCoach-win32-x64'));
    const target = path.join(desktop, 'ORD악몽코치');
    try {
      fs.rmSync(target, {recursive: true, force: true});
      fs.cpSync(built, target, {recursive: true});
      const exe = path.join(target, 'ORDCoach.exe');
      try {
        execSync('powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath(\'Desktop\')+\'\\ORD 악몽 코치.lnk\');$s.TargetPath=$env:ORD_EXE;$s.WorkingDirectory=$env:ORD_DIR;$s.Save()"',
          {env: Object.assign({}, process.env, {ORD_EXE: exe, ORD_DIR: target})});
      } catch (_) {}
      console.log('바탕화면 복사 완료:', target, '(+ "ORD 악몽 코치" 바로가기)');
    } catch (error) {
      console.error('바탕화면 복사 실패 — 코치가 실행 중이면 끄고 다시 빌드하세요:', String(error && error.message || error));
    }
  }
})().catch(error => { console.error(error); process.exit(1); });
