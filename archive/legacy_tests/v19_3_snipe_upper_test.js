'use strict';

// v19.3(사용자 요청): "특정 상위를 저격해서 갈 수 있게 해줘. 브록 초월을
// 가고 싶으면 브록 초월 선택했을 때 강제로 갈 수 있도록."
//
// 저격 계약:
//   · 25라 게이트를 우회한다 — 일찍 정하는 위험은 사용자가 진다.
//   · 순위 목록에 없어도 카탈로그의 어떤 상위든 고를 수 있다.
//   · 확정 뒤에는 기존 기계를 그대로 탄다: upper 잠금 → fixedUpperIds →
//     '확정 상위 우선'(플래너) · upperReserve(엔진).

const assert=require('assert');
const path=require('path');
const fs=require('fs');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_app.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const App=global.ORDApp.App;
const T=global.ORDApp._test;
const BROOK='I90H';      // (B)브룩 💙 — 마딜 상위 (사용자가 예로 든 브록 초월)
const RYOKUGYU='LB0H';   // (S)료쿠규 — 물딜 상위
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}
function makeApp(overrides){
  const app=Object.create(App.prototype);
  app.catalog=global.ORD_TMO_UNITS;
  app.state=Object.assign(T.normalizeInitialState({mode:'',modeExplicit:false}),{
    snapshot:{counts:{},currentAbilities:{},at:1},locks:[]
  },overrides||{});
  app.recordAuditAction=()=>{};app.persist=()=>{};app.render=()=>{};app.setMessage=()=>{};
  return app;
}

check('저격은 25라 전에도 브룩 초월을 강제 확정한다',()=>{
  const app=makeApp({currentRound:10});
  app.act('snipe-upper',{dataset:{id:BROOK}});
  const lock=app.upperLock();
  assert(lock&&lock.id===BROOK,'상위 잠금이 걸리지 않음');
  assert.strictEqual(lock.source,'sniped','저격 잠금 출처가 기록되지 않음');
  const blueprint=app.state.upperBlueprint;
  assert(blueprint&&blueprint.upperId===BROOK,'상위 청사진이 잡히지 않음');
  assert.strictEqual(app.state.mode,'magic','마딜 상위인데 계통이 안 바뀜');
  assert(['dual','singleEnd'].includes(app.state.magicRoute),`마딜 경로가 확정되지 않음: ${app.state.magicRoute}`);
  assert.strictEqual(app.state.directionStatus,'selected');
  assert.strictEqual(app.state.directionUpperId,BROOK);
});

check('저격은 기존 반대 계통 잠금을 교체하고 관성·힌트를 지운다',()=>{
  const app=makeApp({
    currentRound:30,mode:'physical',modeExplicit:true,
    locks:[{stage:'upper',id:RYOKUGYU,source:'manual-route'}],
    releasedUpperHint:{id:RYOKUGYU,mode:'physical',routeKey:'physical',releasedAt:Date.now(),releasedRound:29},
    secondUpperId:BROOK
  });
  app.act('snipe-upper',{dataset:{id:BROOK}});
  assert.strictEqual(app.upperLock().id,BROOK,'기존 잠금이 교체되지 않음');
  assert.strictEqual(app.state.releasedUpperHint,null,'복구 힌트가 남아 있음');
  // 저격한 상위가 두 번째 상위로도 확정돼 있었다면 중복 확정을 지운다.
  assert.strictEqual(app.state.secondUpperId,'','같은 상위가 메인+두 번째로 이중 확정됨');
});

check('물딜 상위 저격은 물딜 계통으로 확정한다',()=>{
  const app=makeApp({currentRound:12,mode:'magic',modeExplicit:true,magicRoute:'dual'});
  app.act('snipe-upper',{dataset:{id:RYOKUGYU}});
  assert.strictEqual(app.upperLock().id,RYOKUGYU);
  assert.strictEqual(app.state.mode,'physical');
  assert.strictEqual(app.state.directionKey,'physical');
});

check('저격 모달이 검색으로 카탈로그의 모든 상위를 노출한다',()=>{
  const app=makeApp({currentRound:10});
  app._snipeOpen=true;
  const state=app.normalized();
  const html=app.renderSnipeModal(state);
  assert(html.includes('상위 저격'),'모달 제목 없음');
  assert(html.includes('브룩'),'브룩 초월이 목록에 없음');
  assert(html.includes(`data-act="snipe-upper" data-id="${BROOK}"`),'브룩 저격 버튼이 없음');
  // 검색이 실제로 거른다
  app.state.snipeSearch='브룩';
  const filtered=app.renderSnipeModal(state);
  assert(filtered.includes(BROOK),'검색 결과에 브룩이 없음');
  assert(!filtered.includes('료쿠규'),'검색이 거르지 않음');
  // 닫혀 있으면 아무것도 그리지 않는다
  app._snipeOpen=false;
  assert.strictEqual(app.renderSnipeModal(state),'');
});

check('저격이 배선돼 있다 — 감사 로그·거래 롤백·렌더 훅·열기 버튼',()=>{
  const src=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  const logList=src.match(/const RUN_LOG_ACTIONS=new Set\(\[([^\]]*)\]\);/);
  assert(logList&&logList[1].includes("'snipe-upper'"),'감사 로그 목록에 없음');
  const rollback=src.match(/if\(this\.state\.pendingTransaction&&\[([^\]]*)\]\.includes\(a\)\)this\.rollbackTransaction\(\);/);
  assert(rollback&&rollback[1].includes("'snipe-upper'"),'거래 롤백 트리거에 없음');
  assert(/renderSnipeModal\(state\)\}\$\{this\.renderRunResultModal/.test(src),'렌더 훅에 모달이 없음');
  assert(src.includes('data-act="snipe-open"'),'저격 열기 버튼이 없음');
  const css=fs.readFileSync(path.join(EXT,'ord_ui_v20.css'),'utf8');
  assert(css.includes('.snipe-modal{')&&css.includes('.v153-snipe-open{'),'저격 스타일이 없음');
});

check('저격 잠금은 플래너의 확정 상위 규칙을 그대로 탄다(소스 검증)',()=>{
  // 저격이 만든 잠금은 stage:'upper' 그대로라 fixedUpperIds → ruleBlocked
  // '확정 상위 우선' 경로에 자동으로 태워진다.  별도 우회 코드가 생기면
  // (저격만 다른 규칙을 타면) 여기서 잡는다.
  const planner=fs.readFileSync(path.join(EXT,'ord_squad_planner.js'),'utf8');
  assert(planner.includes("row&&row.stage==='upper'&&state.db.byId.has(row.id)"),'fixedUpperIds 의 upper 잠금 수집이 바뀜');
  assert(planner.includes("'확정 상위 우선'"),'확정 상위 우선 규칙이 사라짐');
  assert(!/sniped/.test(planner),'플래너가 저격을 특별 취급한다 — 잠금 하나로 통일돼야 한다');
});

console.log(`\n${checks}/${checks} snipe upper checks passed.`);
