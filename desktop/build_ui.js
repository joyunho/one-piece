'use strict';
// 패키징 준비 — 데스크톱 셸이 로드하는 신작 보드(ord_board/) 자산을
// desktop/ui/ 로 복사한다.  개발(npm start)은 ../ord_board 를 직접 읽지만
// 배포본은 상위 폴더가 없으므로 앱 안에 자산을 품어야 한다.  복사 목록은
// 하드코딩하지 않고 index.html 의 src/href 를 파싱해 만든다(파일 추가 시
// 자동 추종 — 표류 방지 테스트와 같은 원리).
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'ord_board');
const OUT = path.join(__dirname, 'ui');
const PAGE = 'index.html';
// 페이지가 태그로 참조하지 않지만 런타임에 여는 파일들 — 인게임 HUD 창.
const RUNTIME_EXTRA = ['hud.html', 'hud.js'];

const html = fs.readFileSync(path.join(APP, PAGE), 'utf8');
const refs = new Set(RUNTIME_EXTRA);
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const file = match[1];
  if (!/^[\w.-]+$/.test(file)) throw new Error(`외부·비정상 참조가 페이지에 있음: ${file}`);
  refs.add(file);
}

fs.rmSync(OUT, {recursive: true, force: true});
fs.mkdirSync(OUT, {recursive: true});
fs.copyFileSync(path.join(APP, PAGE), path.join(OUT, PAGE));
for (const file of refs) fs.copyFileSync(path.join(APP, file), path.join(OUT, file));
console.log(`ui/ 준비 완료: ${PAGE} + 자산 ${refs.size}개`);
