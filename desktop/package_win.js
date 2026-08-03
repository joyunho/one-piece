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
      FileDescription: 'ORD 2.305 악몽 실전 판단 코치 (데스크톱 셸)',
      CompanyName: 'ORD coach'
    }
  });
  console.log('빌드 완료:', paths.join(', '));
})().catch(error => { console.error(error); process.exit(1); });
