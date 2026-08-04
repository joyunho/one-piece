'use strict';
// v19.11.0 계약 — 데스크톱 셸(Electron) 프로토타입.
//
// ① 보안 계약(정적): 네트워크는 메인 프로세스의 127.0.0.1:25625 한 곳,
//    loadFile 만, contextIsolation:true / nodeIntegration:false, 저장
//    파일명 살균 + .ordlog.json 강제, preload 는 화이트리스트 API 만 노출.
// ② 부트 런타임: ORD_DESKTOP.onDatas 로 들어온 /datas 원본이 확장과 같은
//    번역·합성 경로(ORD_LOCAL_MAP)를 타고 local-direct 스냅샷이 된다.
//    자동 라운드 세대는 localStorage 에 영속된다.
// ③ ordlog 자동 저장 배선과 진단 프로브의 데스크톱 경로.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(EXT,file),'utf8');
const main=fs.readFileSync(path.join(ROOT,'desktop/main.js'),'utf8');
const preload=fs.readFileSync(path.join(ROOT,'desktop/preload.js'),'utf8');
const bootDesktop=read('ord_boot_desktop.js');
const helperDesktop=read('ord_helper_desktop.html');
const app=read('ord_app.js');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

check('① 보안 계약 — 단일 로컬 호스트·loadFile·격리·파일명 살균',()=>{
  new vm.Script(main,{filename:'main.js'});
  new vm.Script(preload,{filename:'preload.js'});
  assert(main.includes("DATAS_HOST = '127.0.0.1'")&&main.includes('DATAS_PORT = 25625'),'로컬 호스트 하드코딩 없음');
  assert(!/https?:\/\/(?!127\.0\.0\.1)/.test(main),'메인에 외부 주소 잔존');
  assert(main.includes('loadFile')&&!main.includes('loadURL'),'원격 로드 경로 존재');
  assert(main.includes('contextIsolation: true')&&main.includes('nodeIntegration: false'),'렌더러 격리 계약 없음');
  assert(main.includes("replace(/[^\\w.-]/g, '')")&&main.includes(".ordlog.json"),'저장 파일명 살균 없음');
  // preload 화이트리스트 — 이 네 API 외 노출 금지.
  for(const api of ['onDatas','probe','toggleOverlay','saveRunLog'])assert(preload.includes(api),`preload API 누락: ${api}`);
  assert(!preload.includes('require(')||preload.split('require(').length===2,'preload 가 electron 외 모듈을 당김');
  assert(helperDesktop.includes('ord_boot_desktop.js')&&!helperDesktop.includes('ord_boot_extension.js'),'데스크톱 헬퍼 부트 배선 오류');
  // 표류 방지 — 데스크톱 헬퍼는 부트 스크립트·meta 표식만 다르고 나머지는
  // ord_helper.html 과 자산 하나까지 같아야 한다(스크립트 추가 시 동반 수정 강제).
  const helper=read('ord_helper.html');
  const norm=(html,boot,meta)=>html.replace(boot,'BOOT').replace(meta,'META');
  assert.strictEqual(
    norm(helperDesktop,'ord_boot_desktop.js',/v[\d.]+-desktop-shell/),
    norm(helper,'ord_boot_extension.js',/v[\d.]+-decision-engine/),
    '데스크톱 헬퍼가 ord_helper.html 과 표류 — 스크립트 목록을 맞춰라');
});

check('② 부트 런타임 — /datas → 번역·합성 → local-direct 스냅샷 + 세대 영속',()=>{
  const context={console,setTimeout,clearTimeout,setInterval:()=>0};
  context.window=context;vm.createContext(context);
  const storage={};
  context.localStorage={getItem:key=>Object.prototype.hasOwnProperty.call(storage,key)?storage[key]:null,setItem:(key,value)=>{storage[key]=String(value);},removeItem:key=>{delete storage[key];}};
  for(const file of ['ord_units_data.js','ord_local_code_map.js','ord_data_patch.js','ord_core.js'])vm.runInContext(read(file),context,{filename:file});
  // 무거운 실제 앱 대신 스텁 — 부트가 계약대로 updateSnapshot 을 부르는지만 본다.
  const applied=[];
  context.ORDApp={create:()=>({state:{},updateSnapshot(snapshot){applied.push(snapshot);},toast(){},render(){}})};
  let feed=null;const saved=[];
  context.ORD_DESKTOP={onDatas(cb){feed=cb;},probe:async()=>({ok:true}),saveRunLog:(name,text)=>{saved.push({name,size:String(text).length});return Promise.resolve({ok:true});},toggleOverlay:async()=>true};
  const listeners={};
  context.document={addEventListener:(type,cb)=>{listeners[type]=cb;},getElementById:()=>({replaceChildren(){}}),createElement:()=>({style:{}})};
  vm.runInContext(bootDesktop,context,{filename:'ord_boot_desktop.js'});
  listeners['DOMContentLoaded']();
  assert(typeof feed==='function','onDatas 구독이 없다');
  // 세라핌 포함 실전 꼴 페이로드 — codes 역색인 경유까지 검증.
  feed({units:{'300h':3,'810e':9,'3A0h':1,'GOLD':500}});
  assert.strictEqual(applied.length,1,'스냅샷이 적용되지 않음');
  const snapshot=applied[0];
  assert.strictEqual(snapshot.source,'local-direct');
  assert.strictEqual(snapshot.counts['300h'],3);
  assert.strictEqual(snapshot.wispCount,9);
  const seraph=Object.keys(snapshot.counts).find(id=>/^unit_/.test(id));
  assert(seraph,'세라핌 합성 id 매핑이 안 탐');
  assert(snapshot.autoRound&&snapshot.autoRound.active===true,'자동 라운드 비활성');
  assert(storage.ordDesktopAutoRound,'자동 라운드 세대가 localStorage 에 영속되지 않음');
  // 같은 데이터 재수신 → seq 유지, 다른 데이터 → seq 증가.
  feed({units:{'300h':3,'810e':9,'3A0h':1,'GOLD':500}});
  feed({units:{'300h':4,'810e':9,'3A0h':1}});
  assert.strictEqual(applied[applied.length-1].seq,applied[0].seq+1,'데이터 변화가 seq 를 안 올림');
  // 빈 응답(게임 꺼짐)은 적용하지 않고 세대만 비활성 전이.
  const before=applied.length;
  feed({units:{}});
  assert.strictEqual(applied.length,before,'빈 응답이 보드를 덮어씀');
  assert(JSON.parse(storage.ordDesktopAutoRound).active===false,'게임 꺼짐 전이가 영속되지 않음');
});

check('③ 자동 저장·프로브 — 데스크톱 경로 배선',()=>{
  assert(bootDesktop.includes('saveRunLog')&&bootDesktop.includes('exportJson'),'ordlog 자동 저장 배선 없음');
  assert(bootDesktop.includes('60000'),'자동 저장 주기 없음');
  assert(app.includes('window.ORD_DESKTOP&&window.ORD_DESKTOP.probe'),'진단 프로브 데스크톱 경로 없음');
  const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'desktop/package.json'),'utf8'));
  assert.strictEqual(pkg.main,'main.js');
  assert(pkg.devDependencies&&pkg.devDependencies.electron,'electron 의존성 없음');
});

check('④ exe 패키징 — 자산 복사 계약 + win32 빌드 스크립트',()=>{
  const buildUi=fs.readFileSync(path.join(ROOT,'desktop/build_ui.js'),'utf8');
  const packWin=fs.readFileSync(path.join(ROOT,'desktop/package_win.js'),'utf8');
  new vm.Script(buildUi,{filename:'build_ui.js'});
  new vm.Script(packWin,{filename:'package_win.js'});
  // 복사 목록은 페이지 파싱으로 만들고, 로컬 파일명이 아닌 참조는 거부한다.
  assert(buildUi.includes('ord_helper_desktop.html')&&buildUi.includes('matchAll'),'페이지 파싱 복사가 아님');
  assert(buildUi.includes('^[\\w.-]+$'),'외부 참조 거부 가드 없음');
  assert(buildUi.includes('ord_direction_worker.js'),'런타임 워커가 복사 목록에 없음');
  // 패키지에는 앱 파일만 싣는다 — node_modules·빌드 도구는 제외.
  for(const pin of ['node_modules','build_ui','package_win','win32','ORDCoach'])assert(packWin.includes(pin),`패키징 계약 누락: ${pin}`);
  const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'desktop/package.json'),'utf8'));
  assert(pkg.scripts&&/build_ui\.js.*package_win\.js/.test(String(pkg.scripts['dist:win'])),'dist:win 스크립트 없음');
  assert(pkg.devDependencies&&pkg.devDependencies['@electron/packager'],'@electron/packager 의존성 없음');
  // 배포본은 앱 내 ui/ 페이지를 우선 로드한다(저장소 상대 경로는 개발 전용).
  assert(main.includes("'ui', 'ord_helper_desktop.html'")&&main.includes('existsSync'),'번들 ui 우선 로드 없음');
  // v19.14.1: dist:win 은 어떤 경로로 실행돼도 결과물을 바탕화면에 복사
  // 한다 — win32 전용 가드(리눅스 CI 빌드는 건너뜀) + OneDrive 대응.
  assert(packWin.includes("process.platform === 'win32'"),'바탕화면 복사 win32 가드 없음');
  assert(packWin.includes("GetFolderPath(\\'Desktop\\')"),'바탕화면 경로 해석 없음');
  assert(packWin.includes('ORD악몽코치')&&packWin.includes('CreateShortcut'),'바탕화면 복사·바로가기 없음');
});

check('⑥ 오버레이 미니 패널 — 우상단 축소·게임 클릭 보존',()=>{
  // v19.14.1: 전체 창 항상-위(게임 가림·클릭 강탈)를 폐기 — 오버레이는
  // 작업영역 우상단의 작은 창으로 줄고, 렌더러는 컴팩트 클래스를 받는다.
  assert(main.includes('getDisplayMatching')&&main.includes('setBounds'),'미니 패널 배치 없음');
  assert(main.includes("send('ord-overlay-mode'"),'오버레이 모드 이벤트 없음');
  assert(main.includes('savedBounds')&&main.includes('win.setBounds(savedBounds)'),'원래 창 복원 없음');
  assert(preload.includes('onOverlayMode')&&preload.includes("on('ord-overlay-mode'"),'preload 오버레이 구독 없음');
  assert(bootDesktop.includes("classList.toggle('ord-overlay-mode'"),'부트 컴팩트 클래스 배선 없음');
  const css=read('ord_cockpit_v15.css');
  assert(css.includes('body.ord-overlay-mode')&&css.includes('not([data-region="next-action"])'),'컴팩트 CSS 없음');
  // v19.14.2: 오버레이 위치·크기 기억(사용자가 끌면 그대로 유지) + 기본
  // 크기 축소.  조합 명령어 줄(command-line)은 게임 중 필수라 숨기지 않는다.
  assert(main.includes('ord-overlay-bounds.json')&&main.includes('loadOverlayBounds')&&main.includes('saveOverlayBounds'),'오버레이 위치 기억 없음');
  assert(main.includes('const width = 400'),'축소 기본 크기 아님');
  assert(!css.includes('body.ord-overlay-mode .command-line'),'조합 명령어 줄을 숨기면 안 됨');
  // v19.15.0: 인게임 HUD — 투명·클릭 통과·포커스 불가 창, F8.  미니
  // 패널은 F9 로 이동(HUD 위치 잡기용).  앱 이중 구동 금지: HUD 는
  // 메인 창이 그린 조각을 받아 표시만 한다.
  assert(main.includes('transparent: true')&&main.includes('frame: false')&&main.includes('focusable: false'),'HUD 창 계약 없음');
  assert(main.includes('setIgnoreMouseEvents(true)')&&main.includes('showInactive'),'클릭 통과·포커스 보존 없음');
  assert(main.includes("register('F8', toggleHud)")&&main.includes("register('F9', toggleOverlay)"),'F8/F9 배치 없음');
  assert(main.includes("ipcMain.on('ord-hud-state'"),'HUD 상태 중계 없음');
  assert(preload.includes('sendHudState')&&preload.includes('onHudState'),'preload HUD API 없음');
  assert(bootDesktop.includes('sendHudState')&&bootDesktop.includes('1500'),'부트 HUD 급전 없음');
  const hudHtml=read('ord_hud_desktop.html');
  assert(hudHtml.includes('background:transparent')&&hudHtml.includes('ord_hud_desktop.js'),'HUD 페이지 투명 배경·스크립트 없음');
  assert(!/\son\w+\s*=/.test(hudHtml),'HUD 페이지에 인라인 핸들러 금지');
  const buildUi=fs.readFileSync(path.join(ROOT,'desktop/build_ui.js'),'utf8');
  assert(buildUi.includes('ord_hud_desktop.html')&&buildUi.includes('ord_hud_desktop.js'),'패키징에 HUD 파일 누락');
  // 편의: HUD 켬 상태 기억(재실행 자동 복원) + 기능 없는 버튼 숨김
  // (회복 목표 줄만 유지).
  assert(main.includes('ord-hud-state.json')&&main.includes('saveHudState'),'HUD 상태 기억 없음');
  assert(hudHtml.includes('button:not(.v151-recovery-row)'),'HUD 버튼 정리 없음');
});

check('⑤ 설치·업데이트 스크립트 — 바탕화면 설치 계약',()=>{
  // bat 는 ASCII 전용(코드페이지 무관), ps1 은 UTF-8 BOM(PS5.1 한글) 필수.
  const bat=fs.readFileSync(path.join(ROOT,'바탕화면에_설치.bat'),'latin1');
  assert(/^[\x00-\x7F]*$/.test(bat),'bat에 비ASCII 문자 — 코드페이지 깨짐 위험');
  assert(bat.includes('tools\\desktop_install.ps1')&&bat.includes('-ExecutionPolicy Bypass'),'설치 bat 배선 오류');
  const update=fs.readFileSync(path.join(ROOT,'업데이트.bat'),'latin1');
  assert(/^[\x00-\x7F]*$/.test(update),'업데이트.bat에 비ASCII 문자');
  assert(update.includes('git pull')&&update.includes('desktop_install.ps1'),'업데이트 bat 배선 오류');
  const raw=fs.readFileSync(path.join(ROOT,'tools/desktop_install.ps1'));
  assert(raw[0]===0xEF&&raw[1]===0xBB&&raw[2]===0xBF,'ps1 UTF-8 BOM 없음 — PowerShell 5.1 한글 깨짐');
  const ps1=raw.toString('utf8');
  assert(ps1.includes("GetFolderPath('Desktop')"),'OneDrive 바탕화면 리디렉션 대응 없음');
  assert(ps1.includes('dist:win')&&ps1.includes('CreateShortcut')&&ps1.includes('OpenJS.NodeJS.LTS'),'설치 절차 누락');
  assert(ps1.includes('ORDCoach-win32-x64'),'빌드 산출물 경로 불일치');
});

console.log(`\n${checks} checks passed (v19.11.0 데스크톱 셸)`);
