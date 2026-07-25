'use strict';

// v17.12.1: 리롤 SYNC_BLOCKED 교착 수정 회귀 테스트.
// 실전 로그 20260725_120442: REROLL_ONE 추천(쵸파 혼포인트) → 사용자가
// 게임에서 리롤 실행 → 패 변경으로 추천이 마르코로 재계산 → 확정 클릭이
// 새 대상(마르코)에 걸림 → "마르코 감소"를 기다리는 SYNC_BLOCKED에
// r52~56 내내 갇힘(탈출 수단 없음).

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_app.js'])require(path.join(EXT,file));
const App=global.ORDApp.App;
const SRC=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');

const tests=[];
function test(name,fn){tests.push([name,fn]);}

const app=Object.create(App.prototype);
const pending={id:'220h',name:'마르코',beforeCount:1,at:1000000,baseRound:53};

test('F2: 대기 대상이 아닌 다른 유닛 감소를 리롤 결과로 인정해 해제',()=>{
  // 로그 재현: 마르코(220h)를 기다리는데 쵸파(K20h)가 줄었다.
  assert.strictEqual(app.pendingRerollRelease(pending,{pendingBefore:1,nextPendingCount:1,observedDrop:'K20h',roundNow:53,now:1005000}),'other');
  // 대상 자신의 감소는 기존대로 target 해제.
  assert.strictEqual(app.pendingRerollRelease(pending,{pendingBefore:1,nextPendingCount:0,observedDrop:'220h',roundNow:53,now:1005000}),'target');
});

test('F4: 감소 관측이 없어도 2라운드 또는 120초 경과 시 자동 해제',()=>{
  // 감소 없음 + 1라운드 경과 + 60초 → 유지.
  assert.strictEqual(app.pendingRerollRelease(pending,{pendingBefore:1,nextPendingCount:1,observedDrop:'',roundNow:54,now:1060000}),'');
  // 2라운드 경과 → 해제.
  assert.strictEqual(app.pendingRerollRelease(pending,{pendingBefore:1,nextPendingCount:1,observedDrop:'',roundNow:55,now:1060000}),'timeout');
  // 120초 경과 → 해제 (라운드 정보가 없어도).
  assert.strictEqual(app.pendingRerollRelease({id:'220h',name:'마르코',at:1000000,baseRound:0},{pendingBefore:1,nextPendingCount:1,observedDrop:'',roundNow:0,now:1121000}),'timeout');
  // 교착 로그의 원형: 감소도 경과도 없으면 유지(정상 대기).
  assert.strictEqual(app.pendingRerollRelease(pending,{pendingBefore:1,nextPendingCount:1,observedDrop:'',roundNow:53,now:1005000}),'');
});

test('F1: 확정 클릭 전에 감소가 이미 관측되면 대기를 걸지 않는 경로가 존재',()=>{
  // 소스 배선 검증: _recentCountDrop 60초 창 → pendingReroll 없이 인정.
  assert(SRC.includes('_recentCountDrop'),'감소 관측 기록이 없다');
  assert(/recentDrop&&Date\.now\(\)-C\.num\(recentDrop\.at\)<60000/.test(SRC),'60초 창 검사가 없다');
  assert(SRC.includes('observedDecreaseId:recentDrop.id'),'감사 기록에 관측 감소 id가 남지 않는다');
});

test('F3: SYNC_BLOCKED 두 렌더 지점 모두 리롤 대기 해제 버튼 + 핸들러 배선',()=>{
  const buttons=SRC.split('data-act="cancel-reroll"').length-1;
  assert(buttons>=2,`cancel-reroll 버튼 렌더가 ${buttons}곳 — SYNC_BLOCKED 렌더 2곳 모두 있어야 한다`);
  assert(SRC.includes("if(a==='cancel-reroll')"),'클릭 핸들러가 없다');
  assert(/RUN_LOG_ACTIONS=new Set\(\[[^\]]*'cancel-reroll'/.test(SRC),'감사 로그 액션 등록이 없다');
});

test('상태 직렬화: pendingReroll.baseRound 왕복 보존',()=>{
  assert(SRC.includes('baseRound:Math.max(0,C.num(state.pendingReroll.baseRound))'),'정규화에 baseRound가 없다');
  assert(SRC.includes('baseRound:this.actualRound()'),'확정 시 baseRound를 기록하지 않는다');
});

let failed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`  ok: ${name}`);}
  catch(err){failed++;console.error(`FAIL: ${name}\n  ${err.message}`);}
}
console.log(`V17_12_1_REROLL_RELEASE ${tests.length-failed}/${tests.length} passed`);
if(failed)process.exit(1);
