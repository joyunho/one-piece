'use strict';

// v25.0.0 계약 — 승계판 (v26.0 보조 모드 전환, 사용자 0826).
//
// 원계약(v25.0): "갈 수 있는 유닛" 보드 + 처방 카드 강등.  v26.0 에서
// 사용자가 "지금까지 만든 프로그램은 모두 잊어 … 보조 용도로만" 으로
// 전면 전환하며 v25 보드는 은퇴하고 보조 보드(v26)가 승계했다.
// 이 파일은 은퇴가 완결됐고(부활 금지) 승계 표면이 존재함을 지킨다.
// 원장 게이트 미러·경합 계산 등 살아있는 불변식은 v26_0_0_assistant_test
// 가 계약한다.

const assert=require('assert'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const appSrc=read('ord_app.js');

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① v25 보드 은퇴 완결 — 렌더러·강등 기계 부활 금지',()=>{
  for(const gone of ['v25GoBoardData(state,plan){','renderV25GoBoard(state,plan){','<details class="v25-coach-opinion"','v25-opinion\\\\b'])
    assert(!appSrc.includes(gone),`은퇴한 v25 표면이 되살아남: ${gone}`);
  // 강등 마커 정규식(루트 class 판정)도 강등 기계와 함께 은퇴했다.
  assert(!appSrc.includes('/^<div class="v151-action [^"]*\\bv25-opinion\\b/'),'강등 판정 정규식 잔재');
});

test('② 살아있는 계승 — 철학 문구·스크롤 보존·행 프리미티브',()=>{
  // 철학(v25 → v26 연속): 코치는 조합을 정하지 않는다.
  assert(appSrc.includes('코치가 조합을 정해주지 않습니다'),'철학 문구 소실');
  // 보드 스크롤 면 보존(적대 검증 확정 규약).
  assert(appSrc.includes("'.v151-scroll,.v155-action-core,"),'.v155-action-core 스크롤 보존 누락');
  // 행 프리미티브(.v25-row/.v25-face)는 v26 보조 보드가 재사용한다.
  for(const file of ['ord_ui_v20.css','ord_cockpit_v15.css']){
    const css=read(file);
    assert(css.includes('button.v25-row{display:grid')&&css.includes('.v25-row .v25-face{'),`${file} 행 프리미티브 소실`);
  }
});

test('③ 승계 표면 — v26 보조 보드가 화면·HUD 를 이었다',()=>{
  for(const alive of ['v26CraftData(state){','renderV26Assistant(state,plan,health){','renderV26Craft(state){'])
    assert(appSrc.includes(alive),`승계 표면 소실: ${alive}`);
  const boot=fs.readFileSync(path.join(ROOT,'ord_boot_desktop.js'),'utf8');
  assert(boot.includes('[data-region="next-action"] .v26-board'),'HUD 승계 배선 소실');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V25_0_0_GO_BOARD ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
