'use strict';

// 실제 전투·드랍 확률 엔진이 아니라, 고정한 가상 TMO 패를 1~65라운드
// 추천/제작/최종 보정 흐름에 통과시키는 결정적 회귀 시뮬레이션입니다.

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_core.js'])
  require(path.join(EXT,file));
const Planner=require(path.join(EXT,'ord_squad_planner.js'));

const C=global.ORDCore;
const catalog=global.ORD_TMO_UNITS;
const db=C.buildDb(catalog);
const closestRare=db.byId.get('420h');
const closestLegend=db.byId.get('V20h');
const chosenUpper=db.byId.get('J40h');
assert(closestRare&&closestLegend&&chosenUpper,'simulation fixtures are missing');

const percentages=Object.fromEntries(catalog.map(unit=>[unit.id,0]));
percentages[closestRare.id]=99;
percentages[closestLegend.id]=98;

let counts={};
for(const unit of catalog){
  if(C.isCommon(unit))counts[unit.id]=14;
  else if(C.isUncommon(unit))counts[unit.id]=7;
  else if(C.isSpecialTier(unit))counts[unit.id]=4;
}
for(const id of Object.keys(C.SPECIAL_IDS))counts[id]=4;
counts[C.WISP_ID]=35;

const upperLocks=[{stage:'upper',id:chosenUpper.id}];
const checkpoints=[];
const buildAudit=[];
let postLegendRoute='';

function settings(round,gorosei='none',recommendWarped=false){
  return{currentRound:round,mode:'physical',magicRoute:'auto',targetSquadCount:9,superKumaOwned:true,recommendWarped,gorosei,postLegendRoute};
}
function state(round,gorosei='none',recommendWarped=false){
  return C.normalizeState(catalog,{
    source:'fixture-tmo',at:1_700_000_000_000+round,counts,
    units:catalog.map(unit=>({id:unit.id,tmoPercent:percentages[unit.id]})),currentAbilities:{}
  },settings(round,gorosei,recommendWarped));
}
function nameOf(id){return C.nameOf(db.byId.get(id))||id;}
function tierTotal(predicate){return db.units.reduce((sum,unit)=>sum+(predicate(unit)?C.num(counts[unit.id]):0),0);}
function inventory(round){
  const current=state(round),progress=C.debugFixture().progressionCounts(current);
  return{rare:tierTotal(C.isRare),legend:progress.legend,upper:progress.upper,squad:progress.squad,wisp:current.wisp};
}
function recordCheckpoint(round,label,locks=[]){
  const current=state(round),flow=C.gameFlow(current,locks,settings(round));
  const row={round,label,flow,inventory:inventory(round)};
  checkpoints.push(row);
  return row;
}
function addUnit(id,amount){counts[id]=C.num(counts[id])+amount;}
function applySolve(id,round,reason,expectedAction){
  const solve=C.recipeSolve(state(round).db,id,counts);
  assert.strictEqual(solve.hardMissing.length,0,`${nameOf(id)} hard material missing`);
  assert(solve.wispCost<=C.num(counts[C.WISP_ID]),`${nameOf(id)} selection wisp shortage`);
  if(expectedAction){
    assert.deepStrictEqual(solve.consumed,expectedAction.solve.consumed,`${nameOf(id)} sequential stock drift`);
    assert.strictEqual(solve.wispCost,expectedAction.wispCost,`${nameOf(id)} wisp debit drift`);
  }
  const beforeWisp=C.num(counts[C.WISP_ID]);
  counts=Object.assign({},solve.stockAfter);
  counts[C.WISP_ID]=beforeWisp-solve.wispCost;
  counts[id]=C.num(counts[id])+1;
  assert(Object.values(counts).every(value=>C.num(value)>=0),'negative material stock');
  const audit={round,id,name:nameOf(id),reason,consumed:Object.assign({},solve.consumed),wispCost:solve.wispCost,wispAfter:counts[C.WISP_ID]};
  buildAudit.push(audit);
  return audit;
}
function topConsumed(map,limit=5){
  return Object.entries(map||{}).sort((a,b)=>C.num(b[1])-C.num(a[1])||nameOf(a[0]).localeCompare(nameOf(b[0]),'ko'))
    .slice(0,limit).map(([id,amount])=>`${nameOf(id)} ${amount}`).join(' · ')||'직접 보유 재료 사용 없음';
}
function hasMissingNonWisp(solve){
  return['uncommon','special','rare','hard','other'].some(key=>Object.values(solve.missingByTier&&solve.missingByTier[key]||{}).some(value=>C.num(value)>0));
}
function rareSpendOf(solve){
  return Object.entries(solve.consumed||{}).reduce((sum,[id,amount])=>sum+(C.isRare(db.byId.get(id))?C.num(amount):0),0);
}
function handTierSpendOf(solve){
  const totals={rare:0,special:0,uncommon:0,common:0};
  for(const [id,amount] of Object.entries(solve&&solve.consumed||{})){
    const tier=C.tierKey(db.byId.get(id));
    if(Object.prototype.hasOwnProperty.call(totals,tier))totals[tier]+=C.num(amount);
  }
  return totals;
}

function finalGradeMetrics(countMap,round,gorosei='none'){
  const current=state(round,gorosei);
  const spec=Planner._test.finalOnlySpec(current,countMap,'physical');
  const profileSettings=Object.assign({},settings(round,gorosei),{_upperUnit:chosenUpper});
  const profile=C.clearProfileDetails(spec,'physical',profileSettings);
  const deficit=C.deficits(spec,'physical',profileSettings);
  const armorCurrent=C.num(profile.armorCurrent),armorTarget=C.num(profile.armorTarget);
  const armorExcess=Math.max(0,armorCurrent-armorTarget);
  const slowTarget=C.num(profile.slowTarget);
  const slowControl=C.num(deficit.control&&deficit.control.slow);
  const slowRaw=Math.max(0,C.num(spec.slow))+Math.max(0,C.num(spec.triggerSlow));
  const slowEffective=Math.min(slowTarget,slowControl);
  const slowExcess=Math.max(0,slowRaw-slowTarget);
  const stunCurrent=C.num(spec.stun),stunTarget=C.num(profile.stunTarget)||1.5;
  const excessStun=Math.max(0,stunCurrent-stunTarget);
  return{
    spec,profile,deficit,armorCurrent,armorTarget,armorExcess,slowTarget,slowControl,slowRaw,slowEffective,
    slowExcess,slowExcessBenefit:0,stunCurrent,stunTarget,excessStun,
    armorMet:armorCurrent>=armorTarget,slowMet:slowControl>=slowTarget,
    halfStunMet:stunCurrent>=.5,fullStunMet:stunCurrent>=stunTarget,
    complete:deficit.clearRows.length===0,
    excessCost:excessStun/stunTarget+slowExcess/Math.max(1,slowTarget)
  };
}
function evaluateFinalCandidate(candidate,round,gorosei='none'){
  const solve=C.recipeSolve(state(round,gorosei).db,candidate.id,counts);
  const feasible=solve.hardMissing.length===0&&!hasMissingNonWisp(solve)&&solve.wispCost<=C.num(counts[C.WISP_ID]);
  if(!feasible)return Object.assign({},candidate,{feasible:false,solve,rareSpent:0});
  const after=Object.assign({},solve.stockAfter);
  after[C.WISP_ID]=C.num(counts[C.WISP_ID])-solve.wispCost;
  after[candidate.id]=C.num(after[candidate.id])+1;
  return Object.assign({},candidate,{feasible:true,solve,after,rareSpent:rareSpendOf(solve),metrics:finalGradeMetrics(after,round,gorosei)});
}
function compareFinalCandidate(a,b){
  // 우선순위: 클리어 충족 → 현재 희귀 소모 → 스턴/원시 이감 초과 최소화
  // → 방깎 목표 초과 최소화. 이미 운영 하한 180을 채웠다면 더 높은 방깎 수치는
  // 이득으로 보지 않고 공속 같은 별도 유틸 자리를 살립니다.
  if(a.metrics.complete!==b.metrics.complete)return Number(b.metrics.complete)-Number(a.metrics.complete);
  if(a.rareSpent!==b.rareSpent)return b.rareSpent-a.rareSpent;
  if(Math.abs(a.metrics.excessCost-b.metrics.excessCost)>1e-9)return a.metrics.excessCost-b.metrics.excessCost;
  if(Math.abs(a.metrics.excessStun-b.metrics.excessStun)>1e-9)return a.metrics.excessStun-b.metrics.excessStun;
  if(Math.abs(a.metrics.slowExcess-b.metrics.slowExcess)>1e-9)return a.metrics.slowExcess-b.metrics.slowExcess;
  const aArmorGap=Math.max(0,a.metrics.armorTarget-a.metrics.armorCurrent);
  const bArmorGap=Math.max(0,b.metrics.armorTarget-b.metrics.armorCurrent);
  if(aArmorGap!==bArmorGap)return aArmorGap-bArmorGap;
  if(Math.abs(a.metrics.armorExcess-b.metrics.armorExcess)>1e-9)return a.metrics.armorExcess-b.metrics.armorExcess;
  return a.sourceRank-b.sourceRank||a.name.localeCompare(b.name,'ko');
}
function assertClosestRecommendation(plan,expected,label){
  assert(plan.actions.length>0,`${label} recommendation is empty`);
  const maxCompletion=Math.max(...plan.rows.map(row=>row.progress)),selected=plan.actions[0];
  assert.strictEqual(selected.progress,maxCompletion,`${label} must select maximum TMO completion`);
  assert.strictEqual(selected.unit.id,expected.id,`${label} expected ${C.nameOf(expected)}, got ${C.nameOf(selected.unit)}`);
  assert.strictEqual(selected.feasible,true,`${label} fixture must be buildable`);
  return selected;
}

// 최종 9기의 선위를 개별 가격이 아니라 하나의 전역 예산으로 판정하는지,
// 152킬 특별함이 첫 희귀 조합식에 실제 재료로 들어가는지 함께 고정합니다.
const pressureBudget=Planner._test.wispBudgetSummary({wisp:{initial:15,required:17,used:0,reserved:15,conflict:2}},9,9);
assert.strictEqual(pressureBudget.fullPartyFeasible,false);
assert.strictEqual(pressureBudget.shortage,2);
const virtualSpecialId='K10h',virtualBaseSettings={currentRound:1,mode:'physical',magicRoute:'auto',targetSquadCount:9,superKumaOwned:true,recommendWarped:false,gorosei:'none',manualCounts:{},wispOverride:100},virtualInput={source:'simulation-virtual-special',counts:{[C.WISP_ID]:100},currentAbilities:{}},virtualState=C.normalizeState(catalog,virtualInput,Object.assign({},virtualBaseSettings,{virtualSpecialId})),plainState=C.normalizeState(catalog,virtualInput,virtualBaseSettings),virtualRareConsumers=virtualState.db.rares.filter(unit=>C.num(C.recipeSolve(virtualState.db,unit.id,virtualState.counts).consumed[virtualSpecialId])>0),virtualHelped=C.recipeSolve(virtualState.db,'X90h',virtualState.counts),virtualPlain=C.recipeSolve(plainState.db,'X90h',plainState.counts);
assert.strictEqual(virtualRareConsumers.length,5);
assert.deepStrictEqual([virtualPlain.wispCost,virtualHelped.wispCost],[15,10]);

// 1~20라: 첫 희귀와 첫 전설·히든은 완성도 최고 후보를 강제합니다.
const rarePlan=C.recommendationPlan(state(7),[],settings(7),[],[]);
assert.strictEqual(rarePlan.purpose,'rare');
const selectedRare=assertClosestRecommendation(rarePlan,closestRare,'first rare');
recordCheckpoint(7,'첫 희귀 추천 직전');
applySolve(selectedRare.unit.id,7,`TMO 완성도 ${selectedRare.progress}% 1위`);
counts[C.WISP_ID]+=1;

const firstLegendParts=closestLegend.stuffs.map(stuff=>stuff.id);
assert.strictEqual(firstLegendParts.length,3);
for(const id of firstLegendParts)addUnit(id,1);
const legendPlan=C.recommendationPlan(state(15),[],settings(15),[],[]);
assert.strictEqual(legendPlan.purpose,'story');
const selectedLegend=assertClosestRecommendation(legendPlan,closestLegend,'first legend/hidden');
recordCheckpoint(15,'첫 전설 추천');
applySolve(selectedLegend.unit.id,18,`TMO 완성도 ${selectedLegend.progress}% 1위`);
const r20=recordCheckpoint(20,'첫 전설 완성 확인');
assert.strictEqual(r20.flow.legendSecured,true);
assert.strictEqual(r20.flow.phase,'post-legend-choice');
const waitingPlan=C.recommendationPlan(state(20),[],settings(20),[],[]);
assert.strictEqual(waitingPlan.actions.length,0,'the coach must wait for the user after the first legend/hidden');
postLegendRoute='upper';
const chosenRoute=recordCheckpoint(20,'사용자 상위 준비 선택');
assert.strictEqual(chosenRoute.flow.phase,'upper-choice');

// 21~25라: 고정 보상으로 희귀 8장을 만든 뒤 로져 물딜 9기를 설계합니다.
const excludedRewards=new Set([closestRare.id,...firstLegendParts]);
const rewardPool=db.rares.filter(unit=>!excludedRewards.has(unit.id)).slice(0,7);
assert.strictEqual(rewardPool.length,7);
for(const unit of rewardPool.slice(0,3))addUnit(unit.id,1);
recordCheckpoint(21,'고도 반영');
for(const unit of rewardPool.slice(3,6))addUnit(unit.id,1);
addUnit(rewardPool[6].id,1);
assert.strictEqual(inventory(25).rare,8);

recordCheckpoint(25,'물딜 상위 확정',upperLocks);
const squadPlan=Planner.planFinalSquad({state:state(25),settings:settings(25),locks:upperLocks,bottleneckCommons:['우솝']});
assert.strictEqual(Planner._test.normalizeSettings({settings:settings(25)}).recommendWarped,true,'legacy settings turned off always-on warped recommendations');
assert.strictEqual(squadPlan.mode,'physical');
assert.strictEqual(squadPlan.targetCount,9);
assert.strictEqual(squadPlan.projectedCount,9);
assert.strictEqual(squadPlan.plannedCount,9);
assert.strictEqual(squadPlan.complete,true);
assert.strictEqual(squadPlan.targetBoardCount,7);
assert.strictEqual(squadPlan.projectedBoardCount,7);
assert.strictEqual(squadPlan.plannedBoardCount,7);
assert.strictEqual(squadPlan.finalLineup.length,7);
assert.strictEqual(squadPlan.actions[0].id,chosenUpper.id);
assert.strictEqual(squadPlan.actions.length,7);
assert.strictEqual(squadPlan.materialOverlap.lineagePairs,0,'always-on warped planning kept an ancestor beside its warped descendant');
const tierLabels={rare:'희귀함',special:'특별함',uncommon:'안흔함',common:'흔함'};
for(const [tier,label] of Object.entries(tierLabels)){
  const allocation=squadPlan.handFit&&squadPlan.handFit.tiers&&squadPlan.handFit.tiers[tier];
  assert(allocation&&allocation.summary,`${label} 전체 패 배분이 없습니다.`);
  assert.strictEqual(allocation.summary.spent,C.num(squadPlan.resourceUse[tier]),`${label} 즉시 소모가 실제 순차 차감과 다릅니다.`);
  assert.strictEqual(allocation.summary.initial,allocation.summary.spent+allocation.summary.reserved+allocation.summary.remaining,`${label} 시작·소모·예약·잔여 합계가 맞지 않습니다.`);
  assert.strictEqual(allocation.summary.conflict,0,`${label} 재료가 둘 이상의 미래 유닛에 중복 예약되었습니다.`);
}
assert.strictEqual(squadPlan.handFit.wisp.used,squadPlan.resourceUse.wisp,'선택위습 실제 차감이 전체 패 지도와 다릅니다.');
assert.strictEqual(squadPlan.handFit.feasible,true,'25라 전체 패로 제안한 최종 9기를 실현할 수 없습니다.');
assert.strictEqual(squadPlan.handFit.hardConflictTotal,0,'25라 후속 슬롯에 없는 희귀·특별·안흔함 또는 필수 아이템이 있습니다.');
assert.strictEqual(squadPlan.wispBudget.fullPartyFeasible,true,'25라 최종 9기의 누적 선택위습 예산이 부족합니다.');
assert(squadPlan.wispBudget.required<=squadPlan.wispBudget.available,'25라 선택위습 합계가 보유량을 넘습니다.');
const plannedNames=squadPlan.finalLineup.map(row=>row.name);
const sequentialActions=squadPlan.actions.slice();

for(const action of sequentialActions.slice(0,2))applySolve(action.id,30,action===sequentialActions[0]?'확정 상위':'라인 방어 전설',action);
assert.strictEqual(recordCheckpoint(30,'상위 + 라인 전설',upperLocks).inventory.squad,4);
for(const action of sequentialActions.slice(2,5))applySolve(action.id,40,'상위 결손 보강',action);
assert.strictEqual(recordCheckpoint(40,'중간 보강 · 환산 7기',upperLocks).inventory.squad,7);
for(const action of sequentialActions.slice(5,6))applySolve(action.id,50,'50라 전 보강',action);
assert.strictEqual(recordCheckpoint(50,'전설급 8기',upperLocks).inventory.squad,8);

// 55라: 원래 9번째 계획과 현재 패치 후보를 동일 재고에서 다시 비교합니다.
const beforePatch=recordCheckpoint(55,'최종 패치 직전',upperLocks);
assert.strictEqual(beforePatch.flow.phase,'final-patch');
const patchPlan=Planner.planFinalSquad({state:state(55),settings:settings(55),locks:upperLocks,bottleneckCommons:['우솝']});
assert.deepStrictEqual(patchPlan.finalPatchOptions.map(option=>option.kind),['legendHidden','ship','rarePair','changed']);
const plannedNinth=sequentialActions[6];
const candidateInputs=[{id:plannedNinth.id,name:plannedNinth.name,label:'25라 설계 마지막 1기분',kind:'planned',sourceRank:0,expectedAction:plannedNinth}];
for(const [index,option] of patchPlan.finalPatchOptions.entries()){
  if(!option.id||option.kind==='rarePair'||candidateInputs.some(row=>row.id===option.id))continue;
  candidateInputs.push({id:option.id,name:option.name,label:option.label,kind:option.kind,sourceRank:index+1,expectedAction:null});
}
const evaluatedPatches=candidateInputs.map(candidate=>evaluateFinalCandidate(candidate,55));
const readyPatches=evaluatedPatches.filter(candidate=>candidate.feasible).sort(compareFinalCandidate);
assert(readyPatches.length>0);
const chosenPatch=readyPatches[0];

// Comparator 자체의 우선순위도 고정합니다: 동일 clear면 희귀 소모가 먼저,
// 희귀 소모도 같으면 정규화한 스턴/원시 이감 초과가 작은 후보가 먼저입니다.
const mockBase={name:'base',sourceRank:0,rareSpent:0,metrics:{complete:true,excessCost:1,excessStun:.2,slowExcess:80,armorTarget:180,armorCurrent:180,armorExcess:0}};
const mockRare=Object.assign({},mockBase,{name:'rare',rareSpent:1,metrics:Object.assign({},mockBase.metrics,{excessCost:9})});
assert(compareFinalCandidate(mockRare,mockBase)<0,'rare consumption must outrank excess minimization after clear');
const mockLean=Object.assign({},mockBase,{name:'lean',metrics:Object.assign({},mockBase.metrics,{excessCost:.5,excessStun:.1,slowExcess:40})});
assert(compareFinalCandidate(mockLean,mockBase)<0,'smaller control excess must win after clear and rare spend');
const mockArmorHeavy=Object.assign({},mockBase,{name:'armor-heavy',metrics:Object.assign({},mockBase.metrics,{armorCurrent:240,armorExcess:30})});
assert(compareFinalCandidate(mockBase,mockArmorHeavy)<0,'smaller armor excess must win after clear, rare spend and control excess');

const nasjuroPatches=candidateInputs.map(candidate=>evaluateFinalCandidate(candidate,55,'nasjuro')).filter(candidate=>candidate.feasible).sort(compareFinalCandidate);
assert(nasjuroPatches.length>0);
assert(evaluatedPatches.filter(candidate=>candidate.feasible).every(candidate=>candidate.metrics.slowTarget===102));
assert(nasjuroPatches.every(candidate=>candidate.metrics.slowTarget===117));

applySolve(chosenPatch.id,55,`클리어·희귀 소모·제어·방깎 초과 비교: ${chosenPatch.label}`,chosenPatch.expectedAction||undefined);
const afterPatch=recordCheckpoint(55,'최종 패치 완료',upperLocks);
assert.strictEqual(afterPatch.inventory.squad,9);
const metrics55=finalGradeMetrics(counts,55);
assert.strictEqual(metrics55.deficit.clearRows.length,0);
assert(metrics55.armorMet&&metrics55.slowMet&&metrics55.halfStunMet);
assert(metrics55.stunCurrent<=2.05,`round 55 final-grade stun oversupply: ${metrics55.stunCurrent}`);
assert.strictEqual(metrics55.slowEffective,metrics55.slowTarget,'useful slow must cap at target');
assert.strictEqual(metrics55.slowExcessBenefit,0,'raw slow excess must add zero benefit');
assert.strictEqual(afterPatch.flow.phase,'upgrade-control');

// 56~65라: 최종 9기 외 하위 재료를 판매하고 업그레이드·컨트롤 단계로 넘깁니다.
let soldMaterialCount=0;
for(const unit of db.units){
  if(!(C.isCommon(unit)||C.isUncommon(unit)||C.isSpecialTier(unit)||C.isRare(unit)))continue;
  soldMaterialCount+=C.num(counts[unit.id]);
  counts[unit.id]=0;
}
const r65=recordCheckpoint(65,'판매·업그레이드·컨트롤',upperLocks);
assert.strictEqual(r65.inventory.squad,9);
assert.strictEqual(r65.flow.phase,'upgrade-control');
const finalState=state(65),finalMetrics=finalGradeMetrics(counts,65),finalUnits=Planner._test.finalEntries(finalState,counts);
assert.strictEqual(finalMetrics.deficit.clearRows.length,0);
assert(finalMetrics.armorCurrent>=finalMetrics.armorTarget);
assert(finalMetrics.slowControl>=finalMetrics.slowTarget);
assert(finalMetrics.stunCurrent>=.5&&finalMetrics.stunCurrent<=2.05);
assert.strictEqual(finalMetrics.slowExcessBenefit,0);
assert.strictEqual(Planner._test.lineupMaterialOverlap(finalState,finalUnits).lineagePairs,0,'round 65 party contains a recipe-lineage collision');

function checkpointLine(row){
  const inv=row.inventory;
  return`${String(row.round).padStart(2,' ')}R | ${row.label} | 단계 ${row.flow.phase} | 희귀 ${inv.rare} · 전설 ${inv.legend} · 상위 ${inv.upper} · 최종급 ${inv.squad} · 선위 ${inv.wisp}`;
}
function controlText(metrics){
  return`목표 ${metrics.slowTarget.toFixed(0)} · 유효 ${metrics.slowEffective.toFixed(2)} · 원시 ${metrics.slowRaw.toFixed(2)} · 초과 ${metrics.slowExcess.toFixed(2)}(이득 ${metrics.slowExcessBenefit})`;
}

console.log('=== 원랜디 2.305 악몽 도우미 v14.0.0 결정적 1~65라 시뮬레이션 ===');
console.log('주의: 실제 전투·드랍 확률이 아니라 명시적 가상 TMO 패의 의사결정 회귀 테스트입니다.');
console.log('추천 정책: 왜곡 경로 항상 허용 · 높은 선위 비용과 재료 계보 중복은 계속 감점');
console.log(`[누적 선위 압력] 보유 ${pressureBudget.available} · 필요 ${pressureBudget.required} · 부족 ${pressureBudget.shortage} → 9기 확정 거부`);
console.log(`[152킬 특별함] X-드레이크(특별함) 적용 희귀 ${virtualRareConsumers.length}종 · X-드레이크(희귀) 선위 ${virtualPlain.wispCost}→${virtualHelped.wispCost}`);
console.log(`7R 첫 희귀: ${C.nameOf(selectedRare.unit)} ${selectedRare.progress}% (후보 최대 ${Math.max(...rarePlan.rows.map(row=>row.progress))}%)`);
console.log(`15R 첫 전설·히든: ${C.nameOf(selectedLegend.unit)} ${selectedLegend.progress}% (후보 최대 ${Math.max(...legendPlan.rows.map(row=>row.progress))}%)`);
console.log('\n[체크포인트]');
for(const row of checkpoints)console.log(checkpointLine(row));
console.log('\n[25R 물딜 9기 설계]');
plannedNames.forEach((name,index)=>console.log(`${index+1}. ${name}`));
console.log(`현재 패 순차 제작 가능 ${squadPlan.projectedCount}/9 · 플래너 완성 ${squadPlan.complete?'예':'아니오'} · 예상 선위 ${squadPlan.resourceUse.wisp}`);
console.log('\n[25R 내 희귀함 사용 지도]');
for(const rare of squadPlan.rareAllocation.filter(row=>row.initial>0)){
  const destinations=rare.usedBy.map(use=>`${use.name} ${use.count}장(${use.label})`);
  if(rare.rerollSuggested&&rare.remaining>0)destinations.push(`남은 ${rare.remaining}장 리롤 권장`);
  console.log(`${rare.name} ${rare.initial}장 → ${destinations.join(' · ')||'보류'}`);
}
console.log(`합계 ${squadPlan.rareSummary.initial}장 = 즉시 사용 ${squadPlan.rareSummary.spent} · 후속 예약 ${squadPlan.rareSummary.reserved} · 리롤 ${squadPlan.rareSummary.reroll} · 중복 충돌 ${squadPlan.rareSummary.conflict}`);
console.log('\n[25R 전체 패 순차 배분]');
for(const [tier,label] of Object.entries(tierLabels)){
  const summary=squadPlan.handFit.tiers[tier].summary;
  console.log(`${label} | 시작 ${summary.initial} · 즉시 소모 ${summary.spent} · 후속 예약 ${summary.reserved} · 잔여 ${summary.remaining} · 중복 충돌 ${summary.conflict}`);
}
console.log(`선택위습 | 시작 ${squadPlan.handFit.wisp.initial} · 즉시 대체 ${squadPlan.handFit.wisp.used} · 후속 예약 ${squadPlan.handFit.wisp.reserved} · 잔여 ${squadPlan.handFit.wisp.remaining} · 부족 충돌 ${squadPlan.handFit.wisp.conflict}`);
console.log(`누적 예산 | 보유 ${squadPlan.wispBudget.available} · 총 필요 ${squadPlan.wispBudget.required} · 부족 ${squadPlan.wispBudget.shortage} · 9기 실현 ${squadPlan.wispBudget.fullPartyFeasible?'가능':'불가'}`);
console.log(`전체 패 적합도 | 희귀 ${squadPlan.handFit.metrics.rareScore} · 특별/안흔/흔함 ${squadPlan.handFit.metrics.lowerScore} · 합계 ${squadPlan.handFit.metrics.score}`);
console.log('[25R 최종 유닛별 전체 패 소모]');
for(const action of sequentialActions){
  const use=handTierSpendOf(action.solve);
  console.log(`${action.name} | 희귀 ${use.rare} · 특별 ${use.special} · 안흔 ${use.uncommon} · 흔함 ${use.common} · 선위 ${action.wispCost}`);
}
console.log('\n[실제 순차 차감]');
for(const audit of buildAudit)console.log(`${audit.round}R ${audit.name} | ${topConsumed(audit.consumed)} | 선위 -${audit.wispCost}, 잔여 ${audit.wispAfter}`);
console.log('\n[55R 최종 패치 메뉴]');
for(const option of patchPlan.finalPatchOptions)console.log(`${option.label}: ${option.name||(option.names||[]).join(' + ')||'후보 없음'} [${option.status}]`);
console.log('[55R 실제 후보별 최종급 스펙 비교]');
for(const candidate of evaluatedPatches){
  if(!candidate.feasible){console.log(`${candidate.label}: ${candidate.name} [현재 재료로 제작 불가]`);continue;}
  const m=candidate.metrics;
  console.log(`${candidate.label}: ${candidate.name} | 희귀 소모 ${candidate.rareSpent} · 방깎 ${m.armorCurrent.toFixed(2)}/${m.armorTarget} · 스턴 ${m.stunCurrent.toFixed(3)}/${m.stunTarget} (초과 ${m.excessStun.toFixed(3)}) · 이감 ${controlText(m)} · 필수 ${m.complete?'충족':'미달'}`);
}
console.log(`선택: ${chosenPatch.label} → ${chosenPatch.name} (클리어 → 희귀 소모 → 스턴·원시 이감 → 방깎 초과 최소)`);
console.log(`[나스쥬로 117 검증] 선택 ${nasjuroPatches[0].name} · ${controlText(nasjuroPatches[0].metrics)}`);
console.log('\n[65R 최종 판정]');
console.log(`최종급 ${r65.inventory.squad}기 · 상위 ${r65.inventory.upper}기 · 물딜 준비도 ${finalMetrics.deficit.readiness}%`);
console.log(`방깎 ${finalMetrics.armorCurrent}/${finalMetrics.armorTarget} · 스턴 ${finalMetrics.stunCurrent.toFixed(3)}/${finalMetrics.stunTarget} (초과 ${finalMetrics.excessStun.toFixed(3)})`);
console.log(`이감 ${controlText(finalMetrics)}`);
console.log(`제어 판정: ${finalMetrics.deficit.control.label} · 단계: ${r65.flow.phase}`);
console.log('[최종 9기]');
finalUnits.forEach((unit,index)=>console.log(`${index+1}. ${nameOf(unit.id)}`));
console.log(`판매 처리한 하위 재료: ${soldMaterialCount}기`);
console.log('PASS  completion-first rare and legend recommendations');
console.log('PASS  nine-slot physical squad, four-tier hand allocation, and sequential material debit');
console.log('PASS  clear -> rare spend -> control/armor-excess final-patch ordering');
console.log('PASS  slow targets 102/117 and raw excess benefit zero');
console.log('PASS  round-65 final-grade-only clear spec and upgrade/control handoff');
console.log('PASS  warped recommendations stay on while recipe-lineage collisions remain blocked');
console.log('PASS  cumulative nine-unit wisp gate and 152-kill Special Rare recipes');
