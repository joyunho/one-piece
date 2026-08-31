'use strict';

// v17.22 — 상위 후보의 9환산 전체 파티 계획을 메인 스레드 밖으로 옮긴다.
//
// 실측(ORD_2305_20260725_120442 재생): 방향 미확정 구간의 E.decide가
// 2.8초였고 그 68%(2,051ms)가 rankUpperBlueprints였다. 메인 스레드라
// 제작·리롤·드랍으로 패가 바뀔 때마다 화면이 그만큼 멈춘다.
//
// 계약:
//  - settings._blueprintPlanSync===false 면 플래너를 부르지 않는다
//    (워커 결과 대기 중인 첫 렌더). 이때도 티어 순서는 이미 정확하다 —
//    티어는 이름에서 읽으므로 계획이 필요 없다.
//  - settings._blueprintRankings[laneKey] 가 오면 그 결과를 그대로 쓴다.
//  - 둘 다 없으면 기존처럼 인라인 계획(Worker 미지원 환경 폴백).

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js'])require(path.join(EXT,file));

const C=global.ORDCore,M=global.ORDV15Model,E=global.ORDV15Engine,catalog=global.ORD_TMO_UNITS;
const LOG=path.join(__dirname,'../data/ORD_2305_20260725_120442_active.ordlog.json');
let passed=0;
function test(name,fn){fn();passed+=1;console.log(`PASS ${name}`);}

function modelAt(round,extraSettings){
  const log=JSON.parse(fs.readFileSync(LOG,'utf8'));
  let counts={},abilities={},progress={},target=null;
  for(const event of log.events){
    if(event.type!=='snapshot')continue;
    const p=event.payload;
    if(p.kind==='full'){counts=Object.assign({},p.counts||{});abilities=Object.assign({},p.currentAbilities||{});progress=Object.assign({},p.progress||{});}
    else{
      for(const [k,v] of Object.entries(p.counts||{})){if(v===null)delete counts[k];else counts[k]=v;}
      for(const [k,v] of Object.entries(p.currentAbilities||{})){if(v===null)delete abilities[k];else abilities[k]=v;}
      for(const [k,v] of Object.entries(p.progress||{})){if(v===null)delete progress[k];else progress[k]=v;}
    }
    if(event.round<=round)target={counts:Object.assign({},counts),abilities:Object.assign({},abilities),progress:Object.assign({},progress)};
  }
  assert(target,`R${round} 스냅샷 없음`);
  const ids=new Set([...Object.keys(target.counts),...Object.keys(target.progress)]);
  return M.build({
    catalog,
    snapshot:{source:'replay',sessionId:'v17-22-worker',seq:1,at:1,dataChangedAt:1,wispCountFound:true,wispCount:C.num(target.counts[C.WISP_ID]),counts:target.counts,currentAbilities:target.abilities,units:[...ids].map(id=>({id,count:Math.max(0,C.num(target.counts[id])),tmoPercent:C.num(target.progress[id])}))},
    settings:Object.assign({currentRound:round,mode:'physical',magicRoute:'physical',gorosei:'warcury',postLegendRoute:'upper',manualCounts:{},superKumaOwned:true,wispOverride:'',virtualSpecialId:'',upperResearchLevel:21},extraSettings||{}),
    locks:[]
  });
}
const tierOf=row=>C.upperPowerTier(row.unit,null).letter;

test('_blueprintPlanSync=false면 플래너를 부르지 않는다',()=>{
  const planner=global.ORDSquadPlanner,original=planner.rankUpperBlueprints;
  let calls=0;
  planner.rankUpperBlueprints=function(...args){calls+=1;return original.apply(this,args);};
  try{
    const rows=E._test.upperRouteCandidates(modelAt(27,{_blueprintPlanSync:false}),[]);
    assert.strictEqual(calls,0,`계획을 건너뛰라고 했는데 플래너를 ${calls}회 호출했다`);
    assert(rows.length>0,'후보가 비었다');
    for(const row of rows){
      assert.strictEqual(row.angleLabel,'미평가','계획하지 않았는데 각 라벨을 지어냈다');
      assert.strictEqual(row.blueprintEvaluation.basis,'route-projection-only');
    }
  }finally{planner.rankUpperBlueprints=original;}
});

test('계획을 건너뛴 첫 렌더에서도 티어 순서는 이미 정확하다',()=>{
  const rows=E._test.upperRouteCandidates(modelAt(27,{_blueprintPlanSync:false}),[]);
  const ranks=rows.map(row=>C.upperPowerTier(row.unit,null)).filter(tier=>tier.known).map(tier=>tier.rank);
  for(let i=1;i<ranks.length;i+=1)
    assert(ranks[i]<=ranks[i-1],`티어 역전 @${i}: ${rows.map(tierOf).join('>')}`);
  assert.strictEqual(tierOf(rows[0]),'S','도달 가능한 최고 티어가 선두가 아니다');
});

test('주입된 랭킹이 있으면 플래너를 다시 돌리지 않고 그대로 쓴다',()=>{
  const planner=global.ORDSquadPlanner,original=planner.rankUpperBlueprints;
  // 워커가 돌려줬다고 가정할 랭킹을 먼저 인라인으로 한 번 만든다.
  const seed=E._test.upperRouteCandidates(modelAt(27),[]);
  const lane={};
  for(const row of seed){
    const bundle=row.blueprintEvaluation;
    if(!bundle||bundle.basis!=='upper-plus-support-full-squad')continue;
    lane[String(row.id)]={upperId:String(row.id),rank:bundle.rank,powerTier:row.powerTier,safetyBand:row.safetyBand,angleBand:row.angleBand,angleLabel:row.angleLabel,tierPromotion:row.tierPromotion,effectiveTierRank:row.effectiveTierRank,roleComplete:bundle.roleComplete,clearComplete:bundle.clearComplete,readiness:bundle.readiness,plan:{}};
  }
  assert(Object.keys(lane).length>0,'주입할 랭킹 시드를 못 만들었다');

  let calls=0;
  planner.rankUpperBlueprints=function(...args){calls+=1;return original.apply(this,args);};
  try{
    const rows=E._test.upperRouteCandidates(modelAt(27,{_blueprintRankings:{physical:lane}}),[]);
    assert.strictEqual(calls,0,`주입된 랭킹이 있는데 플래너를 ${calls}회 다시 호출했다`);
    assert(rows.some(row=>row.blueprintEvaluation&&row.blueprintEvaluation.basis==='upper-plus-support-full-squad'),'주입된 랭킹이 반영되지 않았다');
  }finally{planner.rankUpperBlueprints=original;}
});

test('워커를 못 쓰는 환경에서는 인라인 계획으로 되돌아간다',()=>{
  const planner=global.ORDSquadPlanner,original=planner.rankUpperBlueprints;
  let calls=0;
  planner.rankUpperBlueprints=function(...args){calls+=1;return original.apply(this,args);};
  try{
    const rows=E._test.upperRouteCandidates(modelAt(27),[]);
    assert(calls>0,'플래그가 없는데도 인라인 계획을 하지 않았다 — 수동 HTML(Worker 없음)에서 각이 영영 안 나온다');
    assert(rows.some(row=>row.blueprintEvaluation&&row.blueprintEvaluation.basis==='upper-plus-support-full-squad'));
  }finally{planner.rankUpperBlueprints=original;}
});

test('워커 왕복 후에도 지원 유닛은 실제 카탈로그 이름으로 복원된다',()=>{
  const sourceModel=modelAt(27);
  const messages=[];
  const context={
    console,
    ORD_TMO_UNITS:catalog,
    ORD_UPPER_MEMO:global.ORD_UPPER_MEMO,
    ORD_SYNERGY_MEMO:global.ORD_SYNERGY_MEMO,
    ORDCore:C,
    ORDSquadPlanner:global.ORDSquadPlanner
  };
  context.self=context;
  context.window=context;
  context.importScripts=()=>{};
  context.postMessage=message=>messages.push(message);
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(EXT,'ord_direction_worker.js'),'utf8'),context,{filename:'ord_direction_worker.js'});
  context.onmessage({data:{
    type:'rank-upper-blueprints',
    requestId:23,
    key:'worker-roundtrip',
    payload:{
      snapshot:sourceModel.observed.snapshot,
      settings:sourceModel.settings,
      lanes:[{key:'physical',mode:'physical',route:'physical',candidateIds:['A90H']}]
    }
  }});

  const response=messages[0];
  assert(response&&response.type==='rank-upper-blueprints-result',response&&response.error||'워커 응답 없음');
  const compact=response.rankings.physical.A90H;
  assert(compact&&compact.plan&&compact.plan.finalLineup.length>1,'지원 유닛이 있는 전체 파티 계획을 못 만들었다');
  for(const row of compact.plan.finalLineup){
    assert.deepStrictEqual(Object.keys(row).sort(),['id','status'],'워커가 불완전한 unit 스텁을 다시 보냈다');
  }

  const injectedModel=modelAt(27,{_blueprintRankings:response.rankings});
  const candidate=E._test.upperRouteCandidates(injectedModel,[]).find(row=>row.id==='A90H');
  const supports=candidate&&candidate.blueprintEvaluation&&candidate.blueprintEvaluation.supports||[];
  assert(supports.length>0,'워커 파티의 지원 유닛을 엔진이 복원하지 못했다');
  for(const support of supports){
    const unit=injectedModel.knowledge.db.byId.get(support.id);
    assert(unit,`지원 유닛 ${support.id}가 실제 카탈로그에 없다`);
    assert(support.name&&support.name!==support.id,`지원 유닛 ${support.id} 이름이 비었다`);
    assert(!C.isUpper(unit),`상위 ${support.id}가 전설급 지원 목록에 섞였다`);
  }
});

test('앱·워커 배선',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  const worker=fs.readFileSync(path.join(EXT,'ord_direction_worker.js'),'utf8');
  assert(worker.includes("'rank-upper-blueprints'"),'워커에 전체 파티 계획 작업이 없다');
  assert(worker.includes('rankUpperBlueprints'),'워커가 플래너를 부르지 않는다');
  assert(app.includes('queueBlueprintRank')&&app.includes('applyBlueprintRankings'),'앱에 워커 작업 배선이 없다');
  assert(app.includes('_blueprintPlanSync'),'앱이 동기 계획 금지 플래그를 넘기지 않는다');
  // 워커를 쓸 수 없으면 동기 계획으로 돌아가야 한다.
  assert(/_blueprintPlanSync:!workerReady/.test(app),'폴백 조건이 워커 가용성과 연결되지 않았다');
});

console.log(`V17_22_BLUEPRINT_WORKER ${passed}/6 passed`);
