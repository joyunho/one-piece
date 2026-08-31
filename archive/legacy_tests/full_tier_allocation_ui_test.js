'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js','ord_app.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const App=global.ORDApp.App;
const T=global.ORDApp._test;

const units=[
  {id:C.WISP_ID,name:'위습',groupName:'특수재료',stuffs:[],abilities:{}},
  {id:'c-card',name:'우솝',groupName:'흔함',stuffs:[{id:C.WISP_ID,count:1}],abilities:{}},
  {id:'u-card',name:'상디',groupName:'안흔함',stuffs:[],abilities:{}},
  {id:'s-card',name:'나미',groupName:'특별함',stuffs:[],abilities:{}},
  {id:'r-card',name:'라분',groupName:'희귀함',stuffs:[],abilities:{}},
  {id:'final-card',name:'검은수염',groupName:'초월 [물딜]',stuffs:[{id:'r-card',count:1},{id:'s-card',count:1},{id:'u-card',count:1},{id:'c-card',count:2}],abilities:{'방어력 감소':35}}
];
const db=C.buildDb(units),counts={[C.WISP_ID]:3,'c-card':1,'u-card':1,'s-card':1,'r-card':1},state={db,units,counts,wisp:3},target=db.byId.get('final-card'),solve=C.recipeSolve(db,target.id,counts),fallbackSquad={actions:[{id:target.id,unit:target,solve}],finalLineup:[{id:target.id,unit:target,status:'planned'}]};

const fallback=T.resolveHandLedger(state,fallbackSquad,fallbackSquad.finalLineup.map((item,index)=>({item,unit:item.unit,index})));
assert.strictEqual(fallback.source,'fallback');
assert.deepStrictEqual([
  fallback.tiers.rare.spent,
  fallback.tiers.special.spent,
  fallback.tiers.uncommon.spent,
  fallback.tiers.common.spent,
  fallback.tiers.common.wispSubstitute,
  fallback.wisp.remaining
],[1,1,1,1,1,2]);
assert.deepStrictEqual(fallback.byUnit.get('final-card').tiers,{common:1,uncommon:1,special:1,rare:1});

const plannerSquad={
  finalLineup:[{id:target.id,unit:target,status:'planned'}],actions:[{id:target.id,unit:target,solve}],projectedCount:1,materialOverlap:{lineagePairs:0},
  handFit:{
    tiers:{
      rare:{summary:{initial:2,spent:1,reserved:1,conflict:0,remaining:0},rows:[{id:'r-card',name:'라분',initial:2,spent:1,reserved:1,remaining:0,usedBy:[{id:'final-card',name:'검은수염',count:1,status:'spent'},{id:'final-card',name:'검은수염',count:1,status:'reserved'}]}]},
      special:{summary:{initial:3,spent:1,reserved:0,conflict:0,remaining:2},rows:[{id:'s-card',initial:3,spent:1,remaining:2,usedBy:[{id:'final-card',count:1,status:'spent'}]}]},
      uncommon:{summary:{initial:4,spent:1,reserved:0,conflict:0,remaining:3},rows:[{id:'u-card',initial:4,spent:1,remaining:3,usedBy:[{id:'final-card',count:1,status:'spent'}]}]},
      common:{summary:{initial:5,spent:1,reserved:0,conflict:1,remaining:4,wispSubstitute:1},rows:[{id:'ZX9raw',name:'ZX9raw',initial:0,spent:0,reserved:0,conflict:1,remaining:0,usedBy:[{id:'final-card',count:1,status:'conflict'}]},{id:'c-card',initial:5,spent:1,remaining:4,usedBy:[{id:'final-card',count:1,status:'spent'}]}]}
    },
    wisp:{initial:3,used:1,spent:1,reserved:0,conflict:0,remaining:2,futureWorstCase:4},
    futurePending:[{id:'r-card',name:'라분',tier:'rare',count:1,unitId:'future-support',unitName:'미래 보조'}],
    feasible:true
  },
  wispBudget:{available:3,required:5,remaining:0,shortage:2,withinBudget:false,fullPartyFeasible:false},
  safePrefix:{basis:'current-tmo-stock-only',checkpoint:{dueRound:30},checkpointPass:false,rareRemaining:0,wispUsed:1,actions:[{id:target.id,name:'검은수염',wispCost:1,remainingWisp:2,reason:'현재 패 순차 제작 검증'}]},
  roleCoverage:{planned:{complete:true,rows:[],spec:{}}},bottlenecks:[],finalPatchOptions:[]
};
const planned=T.resolveHandLedger(state,plannerSquad,plannerSquad.finalLineup.map((item,index)=>({item,unit:item.unit,index})));
assert.strictEqual(planned.source,'planner');
assert.deepStrictEqual([planned.tiers.rare.initial,planned.tiers.rare.spent,planned.tiers.rare.reserved,planned.tiers.rare.remaining],[2,1,1,0]);
assert.deepStrictEqual([planned.tiers.common.conflict,planned.tiers.common.wispSubstitute,planned.wisp.remaining],[1,1,2]);

const app=Object.create(App.prototype);
app.state={upperPreviewId:'final-card',directionKey:'physical',gorosei:'none',currentRound:25,roundStartedAt:0,roundPrepSeconds:10,roundNormalSeconds:35,roundBossSeconds:60};
app.actualRound=()=>25;
app.upperLock=()=>null;
const html=app.renderSquadPlan(state,{mode:'physical',squadPlan:plannerSquad});
for(const label of ['핵심 패 소비','희귀함','특별함','안흔함','시작','즉시 사용','미래 참고','가상 잔여','선택위습 · 현재 확정/미래 부족 분리','유닛별 패 사용처','패 사용 · 희귀 2 · 특별 1 · 안흔 1 · 선위 1'])assert(html.includes(label),`missing compact hand UI: ${label}`);
assert(html.includes('<details class="hand-tier-ledger"><summary>등급별 상세 사용처</summary>'));
assert(!html.includes('class="hand-tier-summary common"'),'common consumption summary leaked into coaching UI');
assert(!html.includes('<i>흔함 '),'common usage leaked into a unit card');
assert(!html.includes('ZX9raw'),'raw material/TMO code leaked into visible hand allocation');
assert(html.includes('지금 확정 가능한 제작 순서'));
assert(html.includes('미래 역할 참고안'));
assert(html.includes('파티 확정이 금지됩니다.'));
assert(html.includes('9기는 미확정 · 상위 경로만 선택'),'an unfunded nine-unit reference did not degrade to an Upper-only route lock');
assert(html.includes('data-act="choose-direction" data-key="physical" data-id="final-card"'));
assert(!html.includes('data-act="confirm-upper"'),'an unfunded future nine-unit reference exposed full-party confirmation');

console.log('PASS  four-tier fallback debits the actual sequential hand and selection wisps');
console.log('PASS  planner tierAllocation/handFit overrides fallback with immediate and future reservations');
console.log('PASS  upper preview renders compact Rare/Special/Uncommon destinations without Common totals or raw codes');
