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
    finalLineup:(plan.finalLineup||[]).map(item=>({id:String(item&&item.id||item&&item.unit&&item.unit.id||''),status:String(item&&item.status||''),unit:{id:String(item&&item.unit&&item.unit.id||item&&item.id||'')}})).filter(item=>item.id),
    roleCoverage:{planned:{complete:planned.complete===true,readiness:number(planned.readiness)}},
    handFit:{feasible:!plan.handFit||plan.handFit.feasible!==false,tiers:tierInitial,futurePending:Array.isArray(plan.handFit&&plan.handFit.futurePending)?plan.handFit.futurePending.map(item=>pick(item,['id','name','tier','count','unitId','unitName'])):[]},
    wispBudget:pick(plan.wispBudget||{},['available','required','used','reserved','futureWorstCase','worstCaseRequired','remaining','shortage','withinBudget','fullPartyFeasible']),
    routeEvaluation:compactEvaluation(plan.routeEvaluation),
    safePrefix:compactSafePrefix(plan.safePrefix)
  });
}
function compactRow(row){
  const out=pick(row,['rank','upperId','upperCanonicalId','upperName','mode','completion','rareUsed','rareTotal','rareRemaining','rareConflict','rareClearedTypes','rareUsedTypes','tierUse','lowerHandFitScore','handFeasible','wispFeasible','wispShortage','guaranteed','hardConflictTotal','wispConflict','materialOverlapPenalty','lineagePairs','roleComplete','clearComplete','fullyBuildable','readiness','requirementPriority','projectedCount','wispCost','excessStun','excessSlow','controlExcessScore','controlCapOverflow','directionKey','upperIds','upperNames','status','statusLabel','projectedComplete','guaranteedComplete','provisionalSelectable','futureDependencyCount','unusedRare','upperPreparation','missing','exactVerified','prefixVector','prefixActionCount','prefixRequirementPriority','prefixRareRemaining','prefixWispUsed','prefixTierUse','prefixCommonPressure','prefixStoryProxy']);
  out.routeEvaluation=compactEvaluation(row.routeEvaluation);out.safePrefix=compactSafePrefix(row.safePrefix);out.prefixActions=out.safePrefix.actions;out.blueprint=row.blueprint?pick(row.blueprint,['version','revision','upperId','lineupIds','buildOrderIds','mode','magicRoute']):null;out.plan=compactPlan(row.plan);return out;
}
function compactBoard(board){
  return Object.assign(pick(board,['version','dominant','decision','reason','safeReroll','evaluatedCandidates','availableCandidates','elapsedMs']),{provisionalDirection:board.provisionalDirection?pick(board.provisionalDirection,['upperId','upperCanonicalId','upperName','routeKeys','checkpoint','actions']):null,lanes:(board.lanes||[]).map(lane=>Object.assign(pick(lane,['key','mode','route','label','priority']),{rows:(lane.rows||[]).map(compactRow)}))});
}
self.onmessage=event=>{
  const request=event&&event.data||{};if(request.type!=='rank-directions')return;try{
    const payload=request.payload||{},board=self.ORDSquadPlanner.rankDeckDirections({catalog:self.ORD_TMO_UNITS,snapshot:payload.snapshot||{},settings:payload.settings||{},locks:[]},Object.assign({perLane:2,candidateCap:8},payload.options||{}));
    self.postMessage({type:'rank-directions-result',requestId:request.requestId,key:request.key,board:compactBoard(board)});
  }catch(error){self.postMessage({type:'rank-directions-error',requestId:request.requestId,key:request.key,error:String(error&&error.stack||error)});}
};
