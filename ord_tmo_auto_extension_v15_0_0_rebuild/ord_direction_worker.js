'use strict';
self.window=self;
importScripts(
  'ord_units_data.js',
  'ord_upper_memo.js',
  'ord_synergy_memo.js',
  'ord_data_patch.js',
  'ord_story_nonupper_data.js',
  'ord_story_upper_data.js',
  'ord_core.js',
  'ord_meta_stats.js',
  'ord_squad_planner.js'
);

const number=value=>Number.isFinite(Number(value))?Number(value):0;
const pick=(source,keys)=>Object.fromEntries(keys.filter(key=>source&&source[key]!==undefined).map(key=>[key,source[key]]));
function compactFinish(finish){
  if(!finish)return null;return pick(finish,['status','label','note','stable','expected','maximum','largest','verifiedUnits','maxUnits','riskTags']);
}
function compactEvaluation(evaluation){
  if(!evaluation)return{};const out=pick(evaluation,['route','status','label','note','confirmable','staticComplete','roleOnly','combatVerified','baseMissing']);if(evaluation.finish)out.finish=compactFinish(evaluation.finish);return out;
}
function compactSafePrefix(prefix){
  prefix=prefix||{};return Object.assign(pick(prefix,['basis','guaranteed','mode','route','checkpointPass','rankVector','requirementPriority','rareRemaining','wispUsed','tierUse','commonPressure','storyProxy','actionCount','blockers','note']),{
    checkpoint:pick(prefix.checkpoint||{},['key','dueRound','equivalent']),
    actions:(prefix.actions||[]).map(action=>pick(action,['order','id','name','wispCost','remainingWisp','reason','roles']))
  });
}
function compactPlan(plan){
  plan=plan||{};const planned=plan.roleCoverage&&plan.roleCoverage.planned||{},tiers=plan.handFit&&plan.handFit.tiers||{},tierInitial={};for(const key of ['rare','special','uncommon','common'])tierInitial[key]={initial:number(tiers[key]&&tiers[key].initial)};
  return Object.assign(pick(plan,['version','mode','magicRoute','routeLabel','targetCount','projectedCount','plannedCount','targetBoardCount','projectedBoardCount','plannedBoardCount','complete','draftClearComplete']),{
    // Keep ids only.  A truthy `{unit:{id}}` stub was mistaken for a complete
    // catalog unit after the result crossed back to the main thread.
    finalLineup:(plan.finalLineup||[]).map(item=>({id:String(item&&item.id||item&&item.unit&&item.unit.id||''),status:String(item&&item.status||'')})).filter(item=>item.id),
    roleCoverage:{planned:{complete:planned.complete===true,readiness:number(planned.readiness)}},
    handFit:{feasible:!plan.handFit||plan.handFit.feasible!==false,tiers:tierInitial,futurePending:Array.isArray(plan.handFit&&plan.handFit.futurePending)?plan.handFit.futurePending.map(item=>pick(item,['id','name','tier','count','unitId','unitName'])):[]},
    wispBudget:pick(plan.wispBudget||{},['available','required','used','reserved','futureWorstCase','worstCaseRequired','remaining','shortage','withinBudget','fullPartyFeasible']),
    routeEvaluation:compactEvaluation(plan.routeEvaluation),
    safePrefix:compactSafePrefix(plan.safePrefix)
  });
}
function compactRow(row){
  const out=pick(row,['rank','upperId','upperCanonicalId','upperName','mode','completion','powerTier','safetyBand','angleBand','angleLabel','tierPromotion','effectiveTierRank','memoPackage','rareUsed','rareTotal','rareRemaining','rareConflict','rareClearedTypes','rareUsedTypes','tierUse','lowerHandFitScore','handFeasible','wispFeasible','wispShortage','guaranteed','hardConflictTotal','wispConflict','materialOverlapPenalty','lineagePairs','roleComplete','clearComplete','fullyBuildable','readiness','requirementPriority','projectedCount','wispCost','excessStun','excessSlow','controlExcessScore','controlCapOverflow','directionKey','upperIds','upperNames','status','statusLabel','projectedComplete','guaranteedComplete','provisionalSelectable','futureDependencyCount','unusedRare','upperPreparation','missing','exactVerified','prefixVector','prefixActionCount','prefixRequirementPriority','prefixRareRemaining','prefixWispUsed','prefixTierUse','prefixCommonPressure','prefixStoryProxy']);
  out.routeEvaluation=compactEvaluation(row.routeEvaluation);out.safePrefix=compactSafePrefix(row.safePrefix);out.prefixActions=out.safePrefix.actions;out.blueprint=row.blueprint?pick(row.blueprint,['version','revision','upperId','lineupIds','buildOrderIds','mode','magicRoute']):null;out.plan=compactPlan(row.plan);return out;
}
function compactBoard(board){
  return Object.assign(pick(board,['version','dominant','decision','reason','safeReroll','evaluatedCandidates','availableCandidates','elapsedMs']),{provisionalDirection:board.provisionalDirection?pick(board.provisionalDirection,['upperId','upperCanonicalId','upperName','routeKeys','checkpoint','actions']):null,lanes:(board.lanes||[]).map(lane=>Object.assign(pick(lane,['key','mode','route','label','priority']),{rows:(lane.rows||[]).map(compactRow)}))});
}
// v17.22: 상위 후보의 9환산 전체 파티 계획을 메인 스레드 밖에서 돌린다.
// 후보 하나당 ~250ms라 인라인으로 돌리면 방향 미확정 구간의 판단이
// 2.8초까지 멈춘다.  결과는 upperId → ranking 맵으로 돌려주고 엔진이
// settings._blueprintRankings로 주입받아 그대로 쓴다.
function rankBlueprintsForLanes(payload){
  const lanes=payload&&payload.lanes||[],out={};
  for(const lane of lanes){
    const ids=[...new Set((lane&&lane.candidateIds||[]).map(String))].filter(Boolean);
    if(!ids.length)continue;
    const settings=Object.assign({},payload.settings||{},{mode:lane.mode,magicRoute:lane.route||lane.key,targetSquadCount:9,targetLegendEquivalent:9,upperPreviewId:'',preferredLineupIds:[]});
    const ranked=self.ORDSquadPlanner.rankUpperBlueprints({catalog:self.ORD_TMO_UNITS,snapshot:payload.snapshot||{},settings,locks:[],upperMemo:self.ORD_UPPER_MEMO,synergyMemo:self.ORD_SYNERGY_MEMO},{candidateIds:ids})||[];
    const bag={};
    for(const row of ranked)bag[String(row.upperId)]=compactRow(row);
    out[String(lane.key||lane.mode)]=bag;
  }
  return out;
}
// v19.5(점검 결함): 무거운 계산(요청당 수 초) 중에 밀린 같은 종류의 낡은
// 요청을 완주하지 않는다.  onmessage 는 우편함에 최신 요청만 남기고 처리를
// 매크로태스크로 미룬다 — 큐에 쌓여 있던 이전 메시지들이 먼저 전부 배달돼
// 우편함을 덮어쓴 뒤 처리기가 돌므로, 낡은 요청은 계산 없이 superseded 로
// 회신된다.  메인 스레드는 원래 requestId 로 낡은 응답을 버리므로 안전하다.
const mailbox=new Map();
let drainScheduled=false;
// setTimeout 유무를 호출 시점에 본다: 진짜 워커에는 항상 있고(우편함 효과),
// 테스트 샌드박스(vm)에는 없어서 동기 처리로 물러난다 — 그 환경은 메시지를
// 동기 배달하므로 즉시 처리가 곧 기존 계약이다.
const defer=fn=>{if(typeof setTimeout==='function')setTimeout(fn,0);else fn();};
function handle(request){
  if(request.type==='rank-upper-blueprints'){
    try{self.postMessage({type:'rank-upper-blueprints-result',requestId:request.requestId,key:request.key,rankings:rankBlueprintsForLanes(request.payload||{})});}
    catch(error){self.postMessage({type:'rank-upper-blueprints-error',requestId:request.requestId,key:request.key,error:String(error&&error.stack||error)});}
    return;
  }
  try{
    const payload=request.payload||{},board=self.ORDSquadPlanner.rankDeckDirections({catalog:self.ORD_TMO_UNITS,snapshot:payload.snapshot||{},settings:payload.settings||{},locks:[]},Object.assign({perLane:2,candidateCap:8},payload.options||{}));
    self.postMessage({type:'rank-directions-result',requestId:request.requestId,key:request.key,board:compactBoard(board)});
  }catch(error){self.postMessage({type:'rank-directions-error',requestId:request.requestId,key:request.key,error:String(error&&error.stack||error)});}
}
function drain(){
  drainScheduled=false;
  for(const type of [...mailbox.keys()]){
    const request=mailbox.get(type);
    mailbox.delete(type);
    if(request)handle(request);
    // 처리 중 새 메시지가 오면 그 핸들러가 drain 을 다시 예약한다.
  }
}
self.onmessage=event=>{
  const request=event&&event.data||{};
  if(request.type!=='rank-upper-blueprints'&&request.type!=='rank-directions')return;
  const stale=mailbox.get(request.type);
  if(stale)self.postMessage({type:`${stale.type}-error`,requestId:stale.requestId,key:stale.key,error:'superseded-by-newer-request'});
  mailbox.set(request.type,request);
  if(!drainScheduled){drainScheduled=true;defer(drain);}
};
