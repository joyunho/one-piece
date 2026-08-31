'use strict';
// 데스크톱 셸 계약 (v29.0.0 — 구 v19_11_0 셸 테스트의 살아 있는 조항 이전).
//
// ① 보안: 네트워크는 메인 프로세스의 127.0.0.1:25625 한 곳, loadFile 만,
//    contextIsolation / nodeIntegration:false, 저장 파일명 살균,
//    preload 화이트리스트.
// ② 로드 대상: 신작 보드(ord_board/)만 — 번들 ui/ 우선.
// ③ 패키징: index.html 파싱 복사 + 외부 참조 거부 + HUD 파일 동반,
//    win32 빌드·바탕화면 복사·바로가기.
// ④ 설치 스크립트: bat ASCII·ps1 BOM·버전 표시(desktop/package.json).
// ⑤ 오버레이·HUD: 미니 패널 축소·위치 기억·F5/F6/F10·투명 클릭 통과·
//    신작 컴팩트 클래스·HUD 급전(즉시 + 400ms)·표시 전용.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const main=read('desktop/main.js');
const preload=read('desktop/preload.js');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

check('① 보안 — 단일 로컬 호스트·loadFile·격리·파일명 살균·preload 화이트리스트',()=>{
  new vm.Script(main,{filename:'main.js'});
  new vm.Script(preload,{filename:'preload.js'});
  assert(main.includes("DATAS_HOST = '127.0.0.1'")&&main.includes('DATAS_PORT = 25625'),'로컬 호스트 하드코딩 없음');
  assert(!/https?:\/\/(?!127\.0\.0\.1)/.test(main),'메인에 외부 주소 잔존');
  assert(main.includes('loadFile')&&!main.includes('loadURL'),'원격 로드 경로 존재');
  assert(main.includes('contextIsolation: true')&&main.includes('nodeIntegration: false'),'렌더러 격리 계약 없음');
  assert(main.includes("replace(/[^\\w.-]/g, '')")&&main.includes('.ordlog.json'),'저장 파일명 살균 없음');
  for(const api of ['onDatas','probe','toggleOverlay','onOverlayMode','sendHudState','onHudState'])assert(preload.includes(api),`preload API 누락: ${api}`);
  assert(!preload.includes('require(')||preload.split('require(').length===2,'preload 가 electron 외 모듈을 당김');
});

check('② 로드 대상 — 신작 보드만, 번들 ui/ 우선',()=>{
  assert(main.includes("'ui', 'index.html'")&&main.includes("'ord_board', 'index.html'")&&main.includes('existsSync'),'번들 ui 우선 로드 없음');
  assert(main.includes("resolveUiFile('hud.html')"),'HUD 신작 로드 없음');
  assert(!/path\.join\([^)]*ord_tmo_auto_extension/.test(main),'로드 경로가 옛 프로그램을 참조');
});

check('③ 패키징 — index.html 파싱 복사 + win32 빌드 계약',()=>{
  const buildUi=read('desktop/build_ui.js');
  const packWin=read('desktop/package_win.js');
  new vm.Script(buildUi,{filename:'build_ui.js'});
  new vm.Script(packWin,{filename:'package_win.js'});
  assert(buildUi.includes("'index.html'")&&buildUi.includes("'ord_board'")&&buildUi.includes('matchAll'),'페이지 파싱 복사가 아님');
  assert(buildUi.includes('^[\\w.-]+$'),'외부 참조 거부 가드 없음');
  assert(buildUi.includes("'hud.html'")&&buildUi.includes("'hud.js'"),'HUD 파일 복사 누락');
  for(const pin of ['node_modules','build_ui','package_win','win32','ORDCoach'])assert(packWin.includes(pin),`패키징 계약 누락: ${pin}`);
  assert(packWin.includes("process.platform === 'win32'"),'win32 가드 없음');
  assert(packWin.includes("GetFolderPath(\\'Desktop\\')"),'바탕화면 경로 해석 없음');
  assert(packWin.includes('ORD악몽코치')&&packWin.includes('CreateShortcut'),'바탕화면 복사·바로가기 없음');
  const pkg=JSON.parse(read('desktop/package.json'));
  assert.strictEqual(pkg.main,'main.js');
  assert(pkg.scripts&&/build_ui\.js.*package_win\.js/.test(String(pkg.scripts['dist:win'])),'dist:win 스크립트 없음');
  assert(pkg.devDependencies&&pkg.devDependencies['@electron/packager'],'@electron/packager 의존성 없음');
});

check('④ 설치·업데이트 — bat ASCII·ps1 BOM·버전 표시 원천',()=>{
  const bat=fs.readFileSync(path.join(ROOT,'바탕화면에_설치.bat'),'latin1');
  assert(/^[\x00-\x7F]*$/.test(bat),'bat에 비ASCII 문자');
  assert(bat.includes('tools\\desktop_install.ps1')&&bat.includes('-ExecutionPolicy Bypass'),'설치 bat 배선 오류');
  const update=fs.readFileSync(path.join(ROOT,'업데이트.bat'),'latin1');
  assert(/^[\x00-\x7F]*$/.test(update),'업데이트.bat에 비ASCII 문자');
  assert(update.includes('git pull')&&update.includes('desktop_install.ps1'),'업데이트 bat 배선 오류');
  const raw=fs.readFileSync(path.join(ROOT,'tools/desktop_install.ps1'));
  assert(raw[0]===0xEF&&raw[1]===0xBB&&raw[2]===0xBF,'ps1 UTF-8 BOM 없음');
  const ps1=raw.toString('utf8');
  assert(ps1.includes("desktop\\package.json"),'버전 표시가 신작 원천(desktop/package.json)이 아님');
  assert(!ps1.includes('ord_tmo_auto_extension'),'설치 스크립트가 옛 폴더를 참조');
  assert(ps1.includes("GetFolderPath('Desktop')")&&ps1.includes('dist:win')&&ps1.includes('CreateShortcut')&&ps1.includes('OpenJS.NodeJS.LTS'),'설치 절차 누락');
  assert(ps1.includes('ORDCoach-win32-x64'),'빌드 산출물 경로 불일치');
});

check('⑤ 오버레이·HUD — 미니 패널·단축키·투명 클릭 통과·신작 급전',()=>{
  assert(main.includes('getDisplayMatching')&&main.includes('setBounds'),'미니 패널 배치 없음');
  assert(main.includes("send('ord-overlay-mode'"),'오버레이 모드 이벤트 없음');
  assert(main.includes('savedBounds')&&main.includes('win.setBounds(savedBounds)'),'원래 창 복원 없음');
  assert(main.includes('ord-overlay-bounds.json')&&main.includes('loadOverlayBounds')&&main.includes('saveOverlayBounds'),'오버레이 위치 기억 없음');
  assert(main.includes('const width = 400'),'축소 기본 크기 아님');
  assert(main.includes('transparent: true')&&main.includes('frame: false')&&main.includes('focusable: false'),'HUD 창 계약 없음');
  assert(main.includes('setIgnoreMouseEvents(true, {forward: true})')&&main.includes('showInactive'),'클릭 통과·포커스 보존 없음');
  assert(main.includes("register('F5', toggleHud)")&&main.includes("register('F6', toggleOverlay)")&&main.includes("register('F10', moveOverlayToNextDisplay)"),'F5/F6/F10 배치 없음');
  assert(main.includes("ipcMain.on('ord-hud-state'"),'HUD 상태 중계 없음');
  assert(main.includes('ord-hud-state.json')&&main.includes('saveHudState'),'HUD 상태 기억 없음');
  const boardApp=read('ord_board/app.js');
  const boardCss=read('ord_board/board.css');
  assert(boardApp.includes("classList.toggle('ord-overlay-mode'"),'신작 컴팩트 클래스 배선 없음');
  assert(boardCss.includes('body.ord-overlay-mode'),'신작 컴팩트 CSS 없음');
  assert(boardApp.includes('sendHudState')&&boardApp.includes('setInterval(push,400)'),'신작 HUD 급전 없음');
  const hudHtml=read('ord_board/hud.html');
  assert(hudHtml.includes('background:transparent')&&hudHtml.includes('hud.js'),'HUD 페이지 투명·스크립트 없음');
  assert(!/\son\w+\s*=/.test(hudHtml),'HUD 페이지 인라인 핸들러 금지');
  const hudJs=read('ord_board/hud.js');
  assert(hudJs.includes('onHudState')&&!hudJs.includes('addEventListener'),'HUD 표시 전용 계약 위반');
});

console.log(`\n${checks} checks passed (데스크톱 셸 계약 v29)`);
