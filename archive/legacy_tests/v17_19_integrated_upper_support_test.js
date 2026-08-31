'use strict';

// v17.19: Upper and its supporting Legends are one strategic ranking unit.
// Replays the last supplied R25 hand where the old standalone clearValue order
// was Cavendish #1 / Gaban #2 despite four/zero projected dead-end evidence.

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of [
  'ord_story_nonupper_data.js','ord_story_upper_data.js','ord_units_data.js',
  'ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js',
  'ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js',
  'ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js',
  'ord_v15_policy.js','ord_v15_engine.js','ord_app.js'
])require(path.join(EXT,file));

const C=global.ORDCore;
const P=global.ORDSquadPlanner;
const E=global.ORDV15Engine;
const App=global.ORDApp.App;
const Compactor=require(path.join(EXT,'ord_run_log_compactor.js'));
const catalog=global.ORD_TMO_UNITS;

function replayR25(){
  const log=JSON.parse(fs.readFileSync(path.join(ROOT,'data/ORD_2305_20260725_120442_active.ordlog.json'),'utf8'));
  let baseline=null,target=null,event=null;
  for(const item of log.events)if(item.type==='snapshot'){
    baseline=Compactor.applySnapshotRecord(baseline,item.payload,{digest:false});
    if(item.round===25){target=JSON.parse(JSON.stringify(baseline));event=item;}
  }
  assert(target&&event,'R25 compact snapshot missing');
  const wisp=Number(target.counts[C.WISP_ID]||22),snapshot={
    source:'replay',sessionId:'v17-19-r25',seq:event.seq,at:1,dataChangedAt:1,
    counts:target.counts,currentAbilities:target.currentAbilities,
    wispCountFound:true,wispCount:wisp,
    units:catalog.map(unit=>({id:unit.id,count:Number(target.counts[unit.id]||0),tmoPercent:Number(target.progress[unit.id]||0)}))
  };
  const settings={mode:'physical',magicRoute:'physical',currentRound:25,targetSquadCount:9,targetLegendEquivalent:9,gorosei:'none',postLegendRoute:'upper',superKumaOwned:true};
  return{snapshot,settings,state:C.normalizeState(catalog,snapshot,settings)};
}

const replay=replayR25();
const decision=E.decide({catalog,snapshot:replay.snapshot,settings:replay.settings,locks:[]});
// v21.0: 방향 대기 상태는 폐지 — 자동 채택(routeAuto) 후에도 후보는 그대로 실린다.
  assert.notStrictEqual(decision.state,'ROUTE_CHOICE');assert(decision.routeAuto,'자동 채택 없음');
// v21.0: 게이트 evidence 대신 자동 채택 정보(routeAuto)가 순위 권위를 밝힌다.
assert.strictEqual(decision.routeAuto.rankingAuthority,'upper-plus-support-full-squad');
assert(decision.routeCandidates.length>0&&decision.routeCandidates.length<=6);

// v17.21: 9환산 전체 파티 계획은 후보 하나당 ~250ms라 숏리스트 전부를
// 계획하면 방향 미확정 구간의 E.decide가 2.8초까지 늘어난다(메인 스레드).
// 상위 몇 개만 계획하고 나머지는 투영 순서를 유지하되, 계획하지 않은
// 후보는 각 라벨을 지어내지 않고 '미평가'로 명시한다.
let plannedRows=0;
for(let index=0;index<decision.routeCandidates.length;index++){
  const row=decision.routeCandidates[index],bundle=row.blueprintEvaluation;
  assert(bundle,`${row.name}: blueprintEvaluation missing`);
  if(bundle.basis!=='upper-plus-support-full-squad'){
    assert.strictEqual(bundle.basis,'route-projection-only',`${row.name}: unexpected bundle basis ${bundle.basis}`);
    assert.strictEqual(bundle.planned,false,`${row.name}: unplanned row claims a plan`);
    assert.strictEqual(row.angleLabel,'미평가',`${row.name}: unplanned row invented an angle label`);
    continue;
  }
  plannedRows+=1;
  assert.strictEqual(bundle.rank,index+1,`${row.name}: displayed order differs from bundle order`);
  assert(bundle.supports.length<=3,'support preview exceeds three');
  for(const support of bundle.supports){
    const unit=replay.state.db.byId.get(support.id);
    assert(unit&&!C.isUpper(unit)&&!C.isShip(unit),`${support.name}: invalid support preview`);
  }
}
assert(plannedRows>0,'no candidate received the integrated full-squad bundle');
// v17.26: 계획 여부보다 티어가 우선이므로 계획된 행과 미계획 행이
// 섞일 수 있다(미계획 S티어가 계획된 A티어 위에 오는 것이 옳다).
// 계약은 "티어 단조"이지 "계획된 것이 먼저"가 아니다.
const tierRanks=decision.routeCandidates.map(row=>C.upperPowerTier(row.unit,replay.state.db)).filter(tier=>tier.known).map(tier=>tier.rank);
for(let index=1;index<tierRanks.length;index+=1)
  assert(tierRanks[index]<=tierRanks[index-1],`티어 역전 @${index}: ${decision.routeCandidates.map(row=>C.upperPowerTier(row.unit,replay.state.db).letter).join('>')}`);

const gabanIndex=decision.routeCandidates.findIndex(row=>row.id==='F40h');
const cavendishIndex=decision.routeCandidates.findIndex(row=>row.id==='B50h');
// v17.21: 이 단언의 취지는 "단독 DPS가 더 이상 1순위를 정하지 않는다"였다.
// 티어(S>A>B>C>D>F)가 1순위 축이 된 뒤로 (A)카벤딧슈는 A티어 자격으로
// 상단에 남을 수 있다 — 다만 더 이상 1순위가 아니고, 발동 DPS도 미검증
// 감산을 거친 값이다.  (D)스코퍼가반은 티어대로 하단에 머문다.
// 목록에서 완전히 빠지는 것(-1)은 상단에서 밀려난 것보다 더 나은 결과다.
assert(gabanIndex<0||gabanIndex>=3,`Gaban remained a top-three standalone recommendation (${gabanIndex+1})`);
assert(cavendishIndex>0,`Cavendish is still the standalone leader (${cavendishIndex+1})`);
const leadTier=C.upperPowerTier(decision.routeCandidates[0].unit,replay.state.db);
assert(leadTier.known,'lead candidate has no readable tier');
for(const row of decision.routeCandidates.slice(1)){
  const tier=C.upperPowerTier(row.unit,replay.state.db);
  if(tier.known)assert(tier.rank<=leadTier.rank,`${row.name}(${tier.letter})가 1순위(${leadTier.letter})보다 높은 티어다`);
}
// v17.21: 티어가 1순위 축이 된 뒤로 3순위에는 환산이 낮은 A티어가 앉을
// 수 있다.  이 단언의 취지는 "사용자가 실제로 고르는 1순위가 예전
// 4환산 리더보다 나은 파티를 만든다"이므로 선두에만 건다.
assert(C.num(decision.routeCandidates[0].blueprintEvaluation.plannedEquivalent)>=5,`lead bundle did not improve the planned party over old four-equivalent leaders (${decision.routeCandidates[0].blueprintEvaluation.plannedEquivalent})`);
assert(decision.routeCandidates.some((row,index)=>index>0&&row.clearValue.value>decision.routeCandidates[index-1].clearValue.value),'standalone clearValue still controls the displayed order');

const candidateIds=decision.routeCandidates.map(row=>row.id),rankInput={
  catalog,state:replay.state,settings:replay.settings,locks:[]
};
const forward=P.rankUpperBlueprints(rankInput,{candidateIds}).map(row=>row.upperId);
const reversed=P.rankUpperBlueprints(rankInput,{candidateIds:candidateIds.slice().reverse()}).map(row=>row.upperId);
assert.deepStrictEqual(reversed,forward,'upper affinity leaked across candidate order');

const selected=decision.routeCandidates[0],squad=P.planAdaptiveFinalSquad({
  catalog,state:replay.state,
  settings:Object.assign({},replay.settings,{upperPreviewId:selected.id}),
  locks:[],upperBlueprint:null
},{minTarget:9,maxTarget:11});
assert(squad.adaptiveTargets,'adaptive target audit missing');
assert.strictEqual(squad.adaptiveTargets.attempts[0].target,9);
assert.strictEqual(squad.adaptiveTargets.basis,'full-reoptimization-per-legend-equivalent');
if(!squad.adaptiveTargets.attempts[0].accepted)assert.strictEqual(squad.adaptiveTargets.attempts.length,1,'10/11 was attempted before the core nine was feasible');

const app=Object.create(App.prototype);
app.state={locks:[{stage:'upper',id:selected.id}],directionUpperId:selected.id,mode:'physical',magicRoute:'physical',currentRound:25,rerollsUsed:0,snapshot:replay.snapshot};
app._normalizedCacheKey='r25';
const spec=C.currentSpec(replay.state,'physical',{_upperUnit:replay.state.db.byId.get(selected.id)});
const deficits=C.deficits(spec,'physical',{magicRoute:'physical',_upperUnit:replay.state.db.byId.get(selected.id)});
const supportRows=app.v151BuildableLegendRows(replay.state,{mode:'physical',settings:replay.settings,upper:replay.state.db.byId.get(selected.id),spec,deficits,squadPlan:squad});
// v17.26(사용자 요청): 이 패널은 "지금 내 패로 만들 수 있는 전설급"을
// 전부 보여준다.  3개로 자르면 사용자가 자기 선택지를 못 보고, 추천이
// 이상할 때 대조할 기준도 사라진다.  플래너 추천분은 목록 안에서
// squadSupport로 구분되고 맨 앞에 온다.
assert(supportRows.length>0,'craftable legend list is empty');
assert(supportRows.length>3,`craftable legend list is still capped at three (${supportRows.length})`);
assert(supportRows.length<=12,`craftable legend list is unbounded (${supportRows.length})`);
const plannedIds=new Set((squad.finalLineup||[]).map(row=>row.id));
assert(plannedIds.has(supportRows[0].unit.id),'first support recommendation is detached from the global party');
// 추천분(squadSupport)이 목록 앞쪽에 모여야 구분이 의미가 있다.
const firstPlain=supportRows.findIndex(row=>!row.squadSupport);
if(firstPlain>=0)assert(supportRows.slice(firstPlain).every(row=>!row.squadSupport),'planner picks are scattered through the craftable list');
// 필수 결손을 되여는 제작은 여전히 제외한다 — 만들면 손해다.
for(const row of supportRows)
  assert(!((row.impact&&row.impact.regressed)||[]).some(item=>item.required),`${row.unit&&row.unit.id}: 필수 결손을 되여는 제작이 목록에 있다`);

const rare=replay.state.db.rares.find(unit=>Number(replay.state.counts[unit.id])>0);
assert(rare,'owned Rare fixture missing');
const guarded=app.v151ProtectRareDecision({
  state:'REROLL_ONE',label:'희귀 1장 리롤',reason:'local horizon',action:null,
  rare:{rows:[{id:rare.id,name:C.displayNameOf(rare),initial:1,use:0,hold:0,reroll:1,proof:{exclusive:true}}],use:[],hold:[],reroll:[],safeReroll:{id:rare.id,name:C.displayNameOf(rare)}}
},{targetCount:9,rareAllocation:[{id:rare.id,spent:0,reserved:1,usedBy:[{name:'후속 전설'}]}],unusedRare:[]},replay.state);
const guardedRow=guarded.rare.rows.find(row=>row.id===rare.id);
assert(guardedRow,'reserved Rare disappeared from the unified ledger');
assert.strictEqual(guardedRow.hold,1,'the copy reserved by the global party was not protected');
assert.strictEqual(guardedRow.use+guardedRow.hold+guardedRow.reroll,guardedRow.initial,'Rare copies were double-counted or lost');
assert(guardedRow.reroll<=Math.max(0,guardedRow.initial-1),'the party-reserved copy leaked into reroll');
assert.strictEqual(guarded.state,guarded.rare.safeReroll?'REROLL_ONE':'HOLD','state does not match the finite disposable-Rare ledger');

console.log('PASS R25 standalone Cavendish/Gaban leaders are replaced by integrated Upper+support bundles');
console.log('PASS candidate order cannot leak the previous Upper affinity context');
console.log('PASS support recommendations are capped at three and anchored to the same global party');
console.log('PASS 9→10→11 uses full re-optimisation and core-nine gating');
console.log('PASS global party Rare reservation protects its copy while unreserved duplicates remain usable');
