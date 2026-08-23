'use strict';

// v23.9.0 계약 — 사용자 3건(0819b):
// ① "최대한 사용하기 쉽게 … 처음 사용하는 사람이 쉽게 … 직관적으로" —
//    간단 보기: 신규 사용자 기본, 지금 할 일 중심(국면 패널·참고 서랍
//    숨김), 상단 토글로 언제든 전환.
// ② "스택형 상위는 류마 상위도 있어" — JC0h(영원 [마딜], 정본 desc
//    '성장형 딜러라서 빨리 뽑아야 좋음') 추가.
// ③ "오버레이 화면 클릭은 되는데 가려서 안 보이니까 클릭이 힘들어.
//    구조적으로 뭔가 방법이 없을까?" — F8 HUD 를 forward 클릭 통과로
//    두되, 승인 버튼 위에 커서가 있는 동안만 클릭을 받고, 눌린 버튼은
//    메인 창의 같은 버튼으로 중계(화이트리스트).

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const readDesktop=file=>fs.readFileSync(path.join(__dirname,'..','desktop',file),'utf8');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_core.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,units=context.ORD_TMO_UNITS;

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① 간단 보기는 v24.0 2화면 분리로 대체 — 잔재 완전 제거(재핀)',()=>{
  // v23.9 간단 보기의 취지(신규 사용자는 지금 할 일 하나에 집중)는 v24.0
  // 에서 플레이 화면 자체가 됐다 — 토글·simpleMode 상태·CSS 는 남으면
  // 두 진실이 되므로 부재를 계약한다.  대체 배선(분석 버튼)은
  // v24_0_0_two_screen_test 가 계약한다.
  const app=read('ord_app.js');
  for(const gone of ["if(a==='toggle-simple-view')",'v239-view-toggle','simpleMode:null,','simpleMode:this.state.simpleMode'])assert(!app.includes(gone),`간단 보기 잔재: ${gone}`);
  assert(app.includes('data-act="tab" data-tab="analysis"'),'대체 화면(분석) 배선 부재');
  for(const file of ['ord_ui_v20.css','ord_cockpit_v15.css'])assert(!read(file).includes('.v239-simple'),`${file} 간단 보기 CSS 잔재`);
});

test('② 스택형 류마 추가',()=>{
  const ryuma=units.find(u=>String(u.id)==='JC0h');
  assert(ryuma&&/영원/.test(String(ryuma.groupName)),'류마 상위(JC0h) 카탈로그 확인 실패');
  assert(C.isStackRampUpper(ryuma),'류마 상위가 스택형으로 등록되지 않음');
});

test('③ HUD 호버-클릭 — forward 통과 + 호버 활성 + 메인 창 중계(화이트리스트)',()=>{
  const main=readDesktop('main.js'),preload=readDesktop('preload.js');
  assert(main.includes('setIgnoreMouseEvents(true, {forward: true})'),'forward 클릭 통과 부재');
  assert(main.includes("ipcMain.on('ord-hud-interactive'")&&main.includes('setIgnoreMouseEvents(on !== true, {forward: true})'),'호버 활성 IPC 부재');
  assert(main.includes("ipcMain.on('ord-hud-click'"),'클릭 중계 IPC 부재');
  assert(preload.includes('setHudInteractive')&&preload.includes('sendHudClick')&&preload.includes('onHudClick'),'preload HUD 클릭 API 부재');
  const hudjs=read('ord_hud_desktop.js');
  assert(hudjs.includes('elementFromPoint')&&hudjs.includes('setInteractive'),'호버 감지 부재');
  assert(hudjs.includes('sendHudClick'),'클릭 전송 부재');
  const boot=read('ord_boot_desktop.js');
  assert(boot.includes('HUD_CLICK_OK')&&boot.includes("'mark-made': 1"),'중계 화이트리스트 부재');
  assert(boot.includes('CSS.escape'),'중계 셀렉터 이스케이프 부재');
  const hudHtml=read('ord_hud_desktop.html');
  assert(hudHtml.includes(':has(button.primary[data-act])'),'승인 버튼 컨테이너 되살림 부재');
  assert(hudHtml.includes('pointer-events:auto'),'승인 버튼 클릭 활성 부재');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_9_0_SIMPLE_HUDCLICK ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);