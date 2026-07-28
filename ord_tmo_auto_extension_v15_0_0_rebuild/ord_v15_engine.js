(function(root,factory){
'use strict';
const api=factory(root&&root.ORDCore,root&&root.ORDV15Model,root&&root.ORDV15Ledger,root&&root.ORDV15Policy,root&&root.ORDSquadPlanner);
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.ORDV15Engine=api;
})(typeof window!=='undefined'?window:globalThis,function(C,M,L,P,S){
'use strict';

const VERSION='18.1.0';
const MAX_CANDIDATES=36;
const BEAM_WIDTH=6;
const HORIZON=2;
const HAND_TIERS=['rare','special','uncommon','common'];
const AUTHORITY='ord-v15-decision-engine';
const ROUTE_CANDIDATE_LIMIT=6;
// Keep room for one best candidate per missing route role.  Filling the whole
// cap with the direct score first made those reserved role candidates no-ops.
const UPPER_PROJECTION_SHORTLIST=5;
const UPPER_PROJECTION_CAP=8;
// Full-squad ranking is slower than the route projection, so feed it a
// diverse but bounded union: clear-value anchors, role-vector anchors and the
// nearest craft.  This prevents one fashionable Upper from monopolising the
// list without walking the entire catalogue on every TMO update.
const UPPER_BLUEPRINT_CAP=8;
const SUPPORT_STATIC_PROBE_CAP=30;
const SUPPORT_CANDIDATE_CAP=12;
const SUPPORT_BEAM_WIDTH=3;
const COMPLETION_MILESTONES=Object.freeze({
  firstRare:Object.freeze({key:'firstRare',label:'첫 희귀',dueRound:7}),
  firstFinal:Object.freeze({key:'firstFinal',label:'첫 전설·히든',dueRound:20}),
  additionalFinal:Object.freeze({key:'additionalFinal',label:'추가 전설·히든',dueRound:null})
});
// v16.6: full 재료 보호 (all crafting locked) only inside this wisp band of
// the locked upper's quote; farther out, only the upper's own tree materials
// are reserved and the survival search keeps running.
const UPPER_HOLD_WISP_BAND=4;
const UPPER_HOLD_WISP_RATIO=.15;
// v17.13: 상위권 실측 다이제스트(ord_meta_stats.js, 55인·12,035판).  용도는
// 캘리브레이션 원칙 그대로 — 근거 칩 표시 + clearValue 동률 근처 보조
// 타이브레이크(로그 스케일, 상한 소폭)뿐.  게이트·킬 판정에는 절대 쓰지
// 않으며, 모듈이 없으면(구버전 수동판·일부 테스트) 조용히 0으로 동작한다.
const META_STATS=(typeof window!=='undefined'&&window.ORD_META_STATS)||(typeof globalThis!=='undefined'&&globalThis.ORD_META_STATS)||null;
const META_TIEBREAK_CAP=.02;
function metaEvidence(unit){
  if(!META_STATS||!META_STATS.usage||META_STATS.usage.softTiebreak!==true)return null;
  const byCode=META_STATS.byCode||{};
  let best=null;
  for(const code of unit&&unit.codes||[]){
    const entry=byCode[String(code).toLowerCase()];
    if(entry&&(!best||num(entry.games)>num(best.games)))best=entry;
  }
  if(!best)return null;
  const games=num(best.games),total=Math.max(1,num(META_STATS.gameCount));
  return{games,share:round(games/total*100,1)};
}
// v17.14: 이 상위와 함께 쓰인 전설급 실측(upperPairs) — 미리 파티 모달의
// 표시 전용 근거.  변신 상태 코드가 여럿이면 표본이 가장 큰 코드의 동반
// 목록을 쓴다.  순위·게이트·파티 구성 계산에는 절대 쓰지 않는다.
function metaPairEvidence(unit){
  if(!META_STATS||!META_STATS.usage||META_STATS.usage.softTiebreak!==true)return null;
  const byCode=META_STATS.byCode||{},pairsMap=META_STATS.upperPairs||{};
  let bestKey=null,bestGames=-1;
  for(const code of unit&&unit.codes||[]){
    const key=String(code).toLowerCase();
    if(!pairsMap[key])continue;
    const games=byCode[key]?num(byCode[key].games):0;
    if(games>bestGames){bestKey=key;bestGames=games;}
  }
  if(!bestKey)return null;
  const total=Math.max(1,num(META_STATS.gameCount));
  const pairs=pairsMap[bestKey].map(entry=>({code:String(entry[0]),games:num(entry[1]),name:byCode[entry[0]]?String(byCode[entry[0]].name):String(entry[0])}));
  return{games:bestGames,share:round(bestGames/total*100,1),totalGames:total,pairs};
}
const RECIPE_PROFILE_CACHE=new WeakMap();
function num(value){return C&&C.num?C.num(value):(Number(value)||0);}
function round(value,digits=3){const p=Math.pow(10,digits);return Math.round(num(value)*p)/p;}
function clone(map){return Object.assign({},map||{});}
function nameOf(unit){return C.displayNameOf?C.displayNameOf(unit):String(unit&&unit.name||unit&&unit.id||'');}
function tierOf(unit){return C.tierKey(unit);}
function sum(map){return Object.values(map||{}).reduce((total,value)=>total+num(value),0);}
function lockedUpper(locks){return(locks||[]).find(lock=>lock&&lock.stage==='upper')||null;}
function routeFamilyOk(unit,route){if(!unit||!route)return false;const family=C.familyOf(unit);if(C.isUpper(unit))return family===route.mode||family==='neutral';return family===route.mode||family==='neutral'||C.roleContribution(unit,route.mode).utility>0;}
function pseudoUnit(unit){const group=C.groupName(unit),name=nameOf(unit);return /아이템|랜덤|신비/.test(group)||/풀이감|풀방깎/.test(name);}
function finalUnit(unit){return!!unit&&(C.isLegendish(unit)||C.isUpper(unit));}
// v16.1: a pre-game 물딜/마딜 choice restricts completion-phase candidates to
// that family (neutral units always stay).  자동 keeps both families.
// v16.7: 계열 필터 재정의 — 희귀 이하 재료·희귀 후보는 계열을 구분하지
// 않는다.  전설급·상위 후보만 필터를 받고, 자동 모드에서는 첫 전설(보유
// 비상위 전설·히든)이 물딜/마딜 한쪽으로 수렴한 순간부터 그 계열을
// 따른다(중립·혼합 보유면 필터 없음).
function familyIntent(model){
  const mode=model.intent.damageMode;
  if(mode==='physical'||mode==='magic')return mode;
  let physical=0,magic=0;
  for(const unit of model.knowledge.db.legendish){
    if(C.isUpper(unit)||C.isShip(unit)||!/전설|히든/.test(C.groupName(unit)))continue;
    if(num(model.effective.counts[unit.id])<=0)continue;
    const family=C.familyOf(unit);
    if(family==='physical')physical+=1;else if(family==='magic')magic+=1;
  }
  if(physical>0&&magic<=0)return'physical';
  if(magic>0&&physical<=0)return'magic';
  return'';
}
function intentFamilyOk(model,unit){
  if(!unit||!C.isLegendish(unit)&&!C.isUpper(unit))return true;
  const mode=familyIntent(model);
  if(mode!=='physical'&&mode!=='magic')return true;
  return C.familyOf(unit)!==(mode==='physical'?'magic':'physical');
}
function recipeProfile(model,unit){
  const db=model&&model.knowledge&&model.knowledge.db;if(!db||!unit)return{finalAncestors:new Set(),warpedNodes:new Set(),rare:{},special:{},uncommon:{},common:{}};
  let byId=RECIPE_PROFILE_CACHE.get(db);if(!byId){byId=new Map();RECIPE_PROFILE_CACHE.set(db,byId);}if(byId.has(unit.id))return byId.get(unit.id);
  const profile={finalAncestors:new Set(),warpedNodes:new Set(),rare:{},special:{},uncommon:{},common:{}},rootId=unit.id,add=(map,id,value)=>map[id]=num(map[id])+num(value);
  function walk(id,multiplier,path){const current=db.byId.get(id);if(!current||path.has(id))return;const next=new Set(path);next.add(id);if(id!==rootId){if(finalUnit(current))profile.finalAncestors.add(id);if(C.isWarped(current))profile.warpedNodes.add(id);const tier=tierOf(current);if(profile[tier])add(profile[tier],id,multiplier);}for(const stuff of current.stuffs||[])walk(stuff.id,multiplier*num(stuff.count),next);}
  if(C.isWarped(unit))profile.warpedNodes.add(unit.id);walk(unit.id,1,new Set());byId.set(unit.id,profile);return profile;
}
function mapOverlap(left,right){let total=0;for(const id of new Set(Object.keys(left||{}).concat(Object.keys(right||{}))))total+=Math.min(num(left&&left[id]),num(right&&right[id]));return total;}
function pairMaterialOverlap(model,left,right){
  if(!left||!right)return{lineage:false,rare:0,special:0,uncommon:0,common:0,denseRare:false,penalty:0};const a=recipeProfile(model,left),b=recipeProfile(model,right),rare=mapOverlap(a.rare,b.rare),special=mapOverlap(a.special,b.special),uncommon=mapOverlap(a.uncommon,b.uncommon),common=mapOverlap(a.common,b.common),rareBase=Math.max(1,Math.min(sum(a.rare),sum(b.rare))),rareRatio=rare/rareBase,lineage=a.finalAncestors.has(right.id)||b.finalAncestors.has(left.id),denseRare=rare>=2&&rareRatio>=.75;return{lineage,rare,special,uncommon,common,rareRatio:round(rareRatio),denseRare,penalty:round(rare*55+special*9+uncommon*3+common*.18+(denseRare?120:0))};
}
function lineageConflictKeys(model,lineup){const keys=new Set();for(let left=0;left<(lineup||[]).length;left++)for(let right=left+1;right<lineup.length;right++)if(pairMaterialOverlap(model,lineup[left],lineup[right]).lineage)keys.add([lineup[left].id,lineup[right].id].sort().join('|'));return keys;}
function introducesLineageConflict(model,before,after){const prior=lineageConflictKeys(model,before);for(const key of lineageConflictKeys(model,after))if(!prior.has(key))return true;return false;}
function ownedFinals(model,counts){return M.finalEntries(model,counts||model.effective.counts);}
function upperAllowed(model,unit,route,locks,counts){
  if(!C.isUpper(unit))return true;const lock=lockedUpper(locks),owned=new Set(model.knowledge.db.uppers.filter(other=>num(counts[other.id])>0).map(other=>C.canonicalUpperId(other.id))),key=C.canonicalUpperId(unit.id),lockedKey=lock&&C.canonicalUpperId(lock.id),maxUpper=route.key==='dual'?2:1;
  if(owned.has(key)||owned.size>=maxUpper)return false;
  // A confirmed but unfinished upper is a commitment, not a soft score bonus.
  // Until it is actually observed, no other upper may become the authority action.
  if(lockedKey&&!owned.has(lockedKey)&&lockedKey!==key)return false;
  return true;
}
function allCandidates(model,route,locks,counts){return model.knowledge.db.legendish.concat(model.knowledge.db.uppers).filter(unit=>unit&&!pseudoUnit(unit)&&routeFamilyOk(unit,route)&&upperAllowed(model,unit,route,locks,counts));}
// v16: the assessment counts Rare/Special direct combat roles, so the action
// space must be able to close a required gap with a Rare craft too.  The old
// legend-only universe is why every recorded loss ended in a silent HOLD while
// cheap Rare closers existed in the hand.
function combatPowerScore(unit,route){
  const contribution=C.roleContribution(unit,route.mode);
  const common=num(contribution.attack)*1.5+num(contribution.subdamage)*12+num(contribution.boss)*6+num(contribution.frenzy)*6+num(contribution.bossFrenzy)*10;
  if(route.mode==='magic')return round(common+num(contribution.single)*18+num(contribution.end)*18+num(contribution.singleEndExpected)*8+num(contribution.magicSupport)*5+num(contribution.toki)*10);
  // Armor-break and speed are structural support axes. Once their required
  // targets are closed, extra copies are not evidence of more boss damage,
  // so they must not unlock the round-50 firepower exception by themselves.
  return round(common);
}
function boardCombatScore(model,counts,route){
  let score=0;
  for(const unit of model.knowledge.db.units)score+=Math.max(0,num(counts&&counts[unit.id]))*combatPowerScore(unit,route);
  return round(score);
}
function combatRareCandidates(model,route,assessment,counts){
  const open=new Set((assessment&&assessment.requirements||[]).filter(row=>num(row.gap)>0&&!row.waived).map(row=>row.key));
  // v17.6(감사 P0-5): 필수 결손이 전부 닫힌 50라+ 보스 창에서는 보스
  // 화력 축에 기여하는 희귀도 후보 우주에 남긴다 — 아니면 화력 보강
  // 제작이 탐색 자체에 들어오지 못해 영구 HOLD가 된다.
  const keys=open.size?open:model.round.value>=50?new Set(['single','end','singleEndExpected','attack','toki','subdamage','boss','frenzy','bossFrenzy','magicSupport']):null;
  if(!keys||!keys.size)return[];
  return model.knowledge.db.rares.filter(unit=>{
    if(!unit||pseudoUnit(unit))return false;
    const contribution=C.roleContribution(unit,route.mode);
    return[...keys].some(key=>num(contribution[key])>0);
  });
}
function actionUniverse(model,route,locks,assessment,counts){
  const base=allCandidates(model,route,locks,counts),seen=new Set(base.map(unit=>unit.id));
  return base.concat(combatRareCandidates(model,route,assessment,counts).filter(unit=>!seen.has(unit.id)));
}
function relevantKeys(assessment){const keys=new Set();for(const group of assessment.groups||[])for(const row of group.rows||[])if(num(row.gap)>0)keys.add(row.key);return keys;}
function potentialScore(unit,assessment,route,lock){
  const contribution=C.roleContribution(unit,route.mode),keys=relevantKeys(assessment);let score=0,index=0;for(const group of assessment.groups||[]){const weight=Math.max(1,8-index*1.4);for(const row of group.rows||[])if(num(row.gap)>0&&num(contribution[row.key])>0)score+=weight*Math.min(1,num(contribution[row.key])/Math.max(.01,num(row.gap)));index++;}if(C.isUpper(unit)&&lock&&C.canonicalUpperId(lock.id)===C.canonicalUpperId(unit.id))score+=80;if(C.isUpper(unit)&&keys.has('main'))score+=24;return score;
}
function makeRow(model,quote,assessment,reason){
  const unit=quote.unit,story=C.storyGrade(unit),role=C.roleProfile(unit),completion=M.completionFor?M.completionFor(model,unit):null,progress=completion?num(completion.rankingPercent):num(model.effective.percent[unit.id]),rareUse=sum(quote.rareUse),commonTop=C.commonTop(model.knowledge.db,quote.solve.lowestMissing||{},3),blocked=quote.blocked.slice();if(quote.wisp.cost>quote.wisp.before)blocked.push(`선택 위습 ${quote.wisp.cost-quote.wisp.before}개 부족`);
  return{unit,solve:quote.solve,currentSolve:quote.solve,feasible:quote.feasible,blocked:[...new Set(blocked)],availableWisp:quote.wisp.before,wispGap:Math.max(0,quote.wisp.cost-quote.wisp.before),wispBreakdown:{current:quote.wisp.cost,planned:quote.wisp.cost,available:quote.wisp.before,gap:Math.max(0,quote.wisp.cost-quote.wisp.before),basis:'v15-exact-ledger'},progress,progressOriginal:completion?num(completion.originalTmoPercent):progress,progressPredicted:completion?num(completion.predictedTmoPercent):progress,completionProjection:completion,role,story,rareUse,rareSpend:{total:rareUse,byId:Object.entries(quote.rareUse||{}).map(([id,use])=>({id,name:C.materialName(model.knowledge.db,id),use,num:use}))},commonTop,why:{headline:reason||'현재 패의 정확한 순차 원장으로 계산했습니다.',approved:quote.feasible},v15Quote:quote,v15Assessment:assessment};
}
function completionMilestone(value){
  if(value&&typeof value==='object')return{key:String(value.key||''),label:String(value.label||''),dueRound:Number.isFinite(value.dueRound)?num(value.dueRound):null};
  if(COMPLETION_MILESTONES[value])return COMPLETION_MILESTONES[value];
  const label=String(value||'');
  if(label==='첫 희귀')return COMPLETION_MILESTONES.firstRare;
  if(label==='첫 전설·히든')return COMPLETION_MILESTONES.firstFinal;
  return{key:'custom',label,dueRound:null};
}
function completionDecision(model,units,milestone){
  const milestoneSpec=completionMilestone(milestone),label=milestoneSpec.label;
  // v16.7: 같은 완성도·같은 선위 소모라면 스토리 파괴 속도(스토리 등급
  // 점수)가 빠른 쪽을 먼저 설계한다 — 첫 희귀·첫 전설 공통.
  const quoted=units.map(unit=>{const completion=M.completionFor?M.completionFor(model,unit):null;return{unit,quote:L.quote(model,unit,model.effective.counts,{availableRound:model.round.value}),completion:completion?num(completion.rankingPercent):num(model.effective.percent[unit.id]),completionDetail:completion,story:num(C.storyGrade(unit).score)};}).filter(item=>num(model.effective.counts[item.unit.id])<=0&&item.quote.prerequisite.allowed&&!item.quote.blocked.some(reason=>/조합 근거 부족|레시피 순환/.test(reason))).sort((a,b)=>b.completion-a.completion||Number(b.quote.feasible)-Number(a.quote.feasible)||a.quote.wisp.cost-b.quote.wisp.cost||b.story-a.story||nameOf(a.unit).localeCompare(nameOf(b.unit),'ko'));
  let best=quoted[0],deadlineEscape=null;
  // v17.6(감사 P0-6): 완성도 1순위가 지금 제작 불가인 채 하드 마감(첫
  // 희귀 7라 · 첫 전설 20라)에 도달하면, 즉시 제작 가능한 차선으로
  // 전환한다.  마감 전에는 기존 원칙(TMO 최고 완성도 우선) 유지.
  const dueRound=milestoneSpec.dueRound;
  if(best&&!best.quote.feasible&&Number.isFinite(dueRound)&&model.round.value>=dueRound){
    const feasibleBest=quoted.find(item=>item.quote.feasible);
    if(feasibleBest){deadlineEscape={passedName:nameOf(best.unit),passedCompletion:round(best.completion,1),dueRound};best=feasibleBest;}
  }
  if(!best)return{version:VERSION,state:'HOLD',authority:true,label:`${label} 후보 없음`,reason:'특수 선행재료가 없거나 조합 데이터를 확인할 수 없습니다.',action:null,alternatives:[],unknowns:[]};
  const projected=!!(best.completionDetail&&best.completionDetail.isProjected),escapeNote=deadlineEscape?`${deadlineEscape.dueRound}라 마감 도달 — 완성도 1순위 ${deadlineEscape.passedName}(${deadlineEscape.passedCompletion}%)는 지금 제작 불가라 즉시 제작 가능한 후보로 전환했습니다(계속 기다리려면 그쪽 재료를 수동으로 모으세요). `:'',completionReason=`${escapeNote}${projected?`${label} 후보는 152킬 특별함 포함 예상 TMO 완성도 ${round(best.completion,1)}%로 가장 가깝습니다. 원 TMO ${round(best.completionDetail.originalTmoPercent,1)}%에서 레시피 환산 +${round(best.completionDetail.delta,1)}%p입니다.`:`${label} 후보는 원 TMO 완성도 ${round(best.completion,1)}%${deadlineEscape?'로 즉시 제작 가능합니다':'로 가장 가깝습니다'}.`}`,row=makeRow(model,best.quote,null,completionReason),state=best.quote.feasible?'ACT_NOW':'PREPARE';
  const candidate={id:best.unit.id,name:nameOf(best.unit),unit:best.unit,row,quote:best.quote,completion:best.completionDetail,wispCost:best.quote.wisp.cost,wispAfter:best.quote.wisp.after,result:'completion-rule',stopCondition:`선택 위습이 ${best.quote.wisp.cost}개보다 적거나 패가 바뀌면 만들지 말고 다시 동기화`};
  return{version:VERSION,state,authority:true,label:state==='ACT_NOW'?`${label} 제작`:`${label} 재료 준비`,reason:row.why.headline,action:state==='ACT_NOW'?candidate:null,blockedAction:state==='ACT_NOW'?null:candidate,rare:rareLedgerForQuote(model,best.quote,state,label),alternatives:quoted.filter(item=>item.unit.id!==best.unit.id).slice(0,2).map(item=>({id:item.unit.id,name:nameOf(item.unit),wispCost:item.quote.wisp.cost,completion:item.completionDetail,reason:item.completionDetail&&item.completionDetail.isProjected?`예상 TMO ${round(item.completion,1)}% · 원본 ${round(item.completionDetail.originalTmoPercent,1)}%`:`원 TMO ${round(item.completion,1)}%` })),unknowns:[],evidence:{ledger:'exact-sequential',completionRule:true,completionMilestone:milestoneSpec.key,completionBasis:projected?'observed-tmo-plus-recipe-counterfactual':'observed-tmo',virtualSpecialProjected:projected,deadlineEscape:deadlineEscape?{dueRound:deadlineEscape.dueRound,passed:deadlineEscape.passedName}:null,futureDropsCredited:false,clearClaim:false}};
}
function rareLedgerForQuote(model,quote,state,label){
  const rows=[];for(const unit of model.knowledge.db.rares){const initial=Math.max(0,num(model.effective.counts[unit.id]));if(initial<=0)continue;const planned=Math.min(initial,num(quote&&quote.rareUse&&quote.rareUse[unit.id])),use=state==='ACT_NOW'?planned:0,hold=initial-use,reason=use?`${label} 즉시 재료`:planned?`${label} 제작 재료 보호`:`${label} 확정 전 안전 보류`;rows.push({id:unit.id,name:nameOf(unit),unit,initial,use,hold,reroll:0,reason,proof:{planned,use,exclusive:use+hold===initial}});}
  return{basis:'exact-quote-no-reroll-before-milestone',rows,use:rows.filter(row=>row.use>0),hold:rows.filter(row=>row.hold>0),reroll:[],safeReroll:null,conflict:rows.some(row=>!row.proof.exclusive)};
}
function committedUpperDecision(model,route,locks,lock){
  const lockKey=C.canonicalUpperId(lock.id),unit=model.knowledge.db.byId.get(lock.id)||model.knowledge.db.uppers.find(row=>C.canonicalUpperId(row.id)===lockKey);if(!unit)return null;
  const quote=L.quote(model,unit,model.effective.counts,{availableRound:model.round.value}),before=P.evaluate(model,model.effective.counts,route,{round:model.round.value,locks}),after=quote.feasible?P.evaluate(model,quote.after,route,{round:model.round.value,locks}):before,state=quote.feasible?'ACT_NOW':'PREPARE',deltas=quote.feasible?requirementDeltas(before,after):[],
  // v17.5: 레일리(히든)·해적선 차단은 재료 문제가 아니라 스토리 10 보상
  // 미수령이다 — 보호 문구 대신 수령 안내를 앞세운다.
  storyBlocked=!quote.feasible&&quote.blocked.some(text=>/레일리|해적선/.test(String(text)))&&story10RewardOpen(model),
  reason=quote.feasible?`확정한 메인 상위 ${nameOf(unit)}를 먼저 완성합니다. 다른 제작으로 예약 재료를 소비하지 않습니다.`:`${storyBlocked?`스토리 10라운드 보상에서 레일리(히든)+해적선을 선택하면 ${nameOf(unit)} 경로가 열립니다(${C.STORY10_FORFEITS} 포기). `:''}확정한 메인 상위 ${nameOf(unit)}의 재료와 선택 위습을 보호합니다. 완성 전에는 다른 제작과 희귀 리롤을 잠급니다.${quote.blocked.length?` · 차단: ${quote.blocked.join(' · ')}`:''}`,row=makeRow(model,quote,after,reason),candidate={id:unit.id,name:nameOf(unit),unit,row,quote,wispCost:num(quote.wisp.cost),wispAfter:quote.feasible?num(quote.wisp.after):null,result:'committed-upper-first',reason,deltas,stopCondition:`표시 재료가 하나라도 바뀌거나 선택 위습이 ${num(quote.wisp.cost)}개 미만이면 만들지 말고 다시 동기화`,path:quote.feasible?[{id:unit.id,name:nameOf(unit),wispCost:num(quote.wisp.cost)}]:[]};
  return{state,label:quote.feasible?'확정 상위 지금 제작':'확정 상위 재료 보호',reason,action:quote.feasible?candidate:null,blockedAction:quote.feasible?null:candidate,assessment:before,afterAction:after,bestPath:quote.feasible?{steps:candidate.path,assessment:after,remainingWisp:num(quote.wisp.after),deadEnds:[]}:null,rare:rareLedgerForQuote(model,quote,state,`확정 상위 ${nameOf(unit)}`),alternatives:[],unknowns:before.unknowns||[],search:{candidateCount:1,pathCount:quote.feasible?1:0,horizon:0,beamWidth:0,committedUpper:true},evidence:{observed:M.observedEvidence(model),ledger:'exact-current-stock',lockedUpper:unit.id,upperFirst:true,futureDropsCredited:false,clearClaim:false}};
}
function resourceTotals(sequence){const tiers=Object.fromEntries(HAND_TIERS.map(tier=>[tier,0]));let wisp=0;for(const step of sequence||[]){wisp+=num(step.quote.wisp.cost);for(const tier of HAND_TIERS)tiers[tier]+=num(step.quote.tiers.totals[tier]);}return{tiers,wisp};}
function groupImprovement(before,after,index){const left=before.groups&&before.groups[index],right=after.groups&&after.groups[index];if(!left||!right)return false;return right.missed<left.missed||right.missed===left.missed&&right.debt+1e-9<left.debt;}
function futureCoverage(model,node,route,locks,candidateUnits){
  const due=node.assessment.checkpoint.dueRound,unresolved=(node.assessment.groups||[]).filter(group=>!group.pass),unresolvedKeys=new Set(unresolved.flatMap(group=>group.keys||[])),covered=new Set(),affordable=[];
  if(!unresolved.length)return{unresolved:[],covered:[],deadEnds:[],affordableCount:0,examples:[]};
  for(const unit of candidateUnits||[]){const contribution=C.roleContribution(unit,route.mode);if(![...unresolvedKeys].some(key=>num(contribution[key])>0))continue;const q=L.quote(model,unit,node.counts,{availableRound:due});if(!q.feasible||introducesLineageConflict(model,ownedFinals(model,node.counts),ownedFinals(model,q.after)))continue;const after=P.evaluate(model,q.after,route,{round:due,locks});let improved=false;for(const group of unresolved)if(groupImprovement(node.assessment,after,group.index)){covered.add(group.index);improved=true;}if(improved)affordable.push({id:unit.id,name:nameOf(unit),wispCost:q.wisp.cost});if(covered.size>=unresolved.length)break;}
  return{unresolved:unresolved.map(group=>group.index),covered:[...covered],deadEnds:unresolved.filter(group=>!covered.has(group.index)).map(group=>({index:group.index,label:group.label})),affordableCount:affordable.length,examples:affordable.slice(0,6)};
}
function nodeBase(model,counts,route,locks,initial,sequence){const assessment=P.evaluate(model,counts,route,{round:model.round.value,locks}),resources=resourceTotals(sequence),story=(sequence||[]).reduce((total,step)=>total+num(C.storyGrade(step.quote.unit).score),0),completion=(sequence||[]).reduce((total,step)=>total+num(model.effective.percent[step.quote.unit.id]),0),combat=(sequence||[]).reduce((total,step)=>total+combatPowerScore(step.quote.unit,route),0),regression=P.compareVector(assessment.checkpointVector,initial.checkpointVector)>0?1:0;return{counts,assessment,sequence:sequence||[],resources,story,completion,combat,regression,coverage:null,rankVector:[]};}
function nodeRank(model,node,initial){
  const coverage=node.coverage||{deadEnds:[],affordableCount:0},remainingWisp=num(node.counts[C.WISP_ID]),unresolved=(node.assessment.groups||[]).filter(group=>!group.pass).length,reserveTarget=Math.min(num(model.effective.counts[C.WISP_ID]),Math.max(2,unresolved*2)),reserveGap=Math.max(0,reserveTarget-remainingWisp),tier=node.resources.tiers,checkpoint=(node.assessment.checkpointVector||[]).slice(),rareExcess=checkpoint.length?checkpoint.pop():0;
  node.reserve={target:reserveTarget,remaining:remainingWisp,gap:reserveGap};// v17.21: 등급 소모량(-tier.*)이 누적 선위와 후속 커버리지 앞에 있어서
  // "패를 더 많이 태우는 조합"이 "더 싸고 다음 결손까지 닫는 조합"을
  // 이겼다.  순서를 뒤집는다 — 후속 커버리지 → 선위 → 등급 소모.
  // 등급 소모는 남긴다(패 효율은 실제 가치): 위 축이 전부 같을 때만
  // 작동하는 하위 타이브레이크로 내린다.  story는 제거한다 — 스토리
  // 파괴 속도는 악몽 클리어 확률이 아니라고 등급표 스스로 선언했고,
  // 무엇을 실제로 만들지 정하는 이 축에 남아 있으면 안 된다.
  node.rankVector=[node.regression].concat(checkpoint,[coverage.deadEnds.length],node.assessment.fullVector,[reserveGap,-num(node.combat),rareExcess,-coverage.affordableCount,num(node.resources.wisp),-num(tier.rare),-num(tier.special),-num(tier.uncommon),-num(tier.common),-node.completion]);return node.rankVector;
}
function compareNodes(a,b){const vector=P.compareVector(a.rankVector,b.rankVector);if(vector)return vector;const aid=(a.sequence||[]).map(step=>step.quote.targetId).join('|'),bid=(b.sequence||[]).map(step=>step.quote.targetId).join('|');return aid.localeCompare(bid);}
function candidatePool(model,route,locks,assessment,counts,availableRound,restrictedUnits){
  // After the first expansion no new stock appears: every later quote can
  // only consume the already proven stock.  Re-ranking the bounded first-step
  // universe is therefore sufficient and avoids walking the full TMO catalog
  // once for every beam node while the game is running.
  const lock=lockedUpper(locks),rows=[],source=restrictedUnits||allCandidates(model,route,locks,counts),beforeLineup=ownedFinals(model,counts);for(const unit of source){const quote=L.quote(model,unit,counts,{availableRound:availableRound||model.round.value}),potential=potentialScore(unit,assessment,route,lock),combat=combatPowerScore(unit,route);if(quote.feasible&&introducesLineageConflict(model,beforeLineup,ownedFinals(model,quote.after)))continue;if(!quote.feasible&&potential<=0&&combat<=0)continue;rows.push({unit,quote,potential,combat,completion:num(model.effective.percent[unit.id])});}
  rows.sort((a,b)=>Number(b.quote.feasible)-Number(a.quote.feasible)||b.potential-a.potential||b.combat-a.combat||a.quote.wisp.cost-b.quote.wisp.cost||b.completion-a.completion||nameOf(a.unit).localeCompare(nameOf(b.unit),'ko'));const picked=rows.slice(0,MAX_CANDIDATES),seen=new Set(picked.map(row=>row.unit.id));
  for(const group of assessment.groups||[])for(const key of group.keys){const best=rows.filter(row=>num(C.roleContribution(row.unit,route.mode)[key])>0).sort((a,b)=>Number(b.quote.feasible)-Number(a.quote.feasible)||a.quote.wisp.cost-b.quote.wisp.cost||b.potential-a.potential)[0];if(best&&!seen.has(best.unit.id)){seen.add(best.unit.id);picked.push(best);}}
  return picked;
}
// v16: the wisp reservation is no longer a physical-mode round-40 special
// case.  For every route, every open required role keeps its cheapest current
// closer craftable: any feasible candidate whose aftermath would starve one of
// those closers is removed from the pool before ranking.
function protectCriticalBudget(model,route,locks,assessment,rows,counts){
  const source=rows||[],none={applied:false,reason:'',criticalIds:[],rows:source};
  const open=(assessment.requirements||[]).filter(row=>num(row.gap)>0&&!row.waived);
  if(!open.length)return none;
  const closers=new Map();
  for(const req of open){
    const best=source.filter(row=>row.quote.feasible&&num(C.roleContribution(row.unit,route.mode)[req.key])>0).sort((a,b)=>a.quote.wisp.cost-b.quote.wisp.cost||num(b.potential)-num(a.potential)||nameOf(a.unit).localeCompare(nameOf(b.unit),'ko'))[0];
    if(best)closers.set(req.key,{key:req.key,label:req.label,row:best});
  }
  if(!closers.size)return none;
  const criticalIds=[...new Set([...closers.values()].map(item=>item.row.unit.id))],kept=[];
  for(const row of source){
    if(!row.quote.feasible||criticalIds.includes(row.unit.id)){kept.push(row);continue;}
    const contribution=C.roleContribution(row.unit,route.mode);
    const preserves=[...closers.values()].every(item=>num(contribution[item.key])>0||L.quote(model,item.row.unit,row.quote.after,{availableRound:model.round.value}).feasible);
    if(preserves)kept.push(row);
  }
  if(kept.length===source.length)return Object.assign({},none,{criticalIds});
  const labels=[...closers.values()].map(item=>item.label);
  return{applied:true,reason:`남은 필수 결손(${labels.slice(0,3).join(' · ')})의 최저 선위 마감 경로를 예약하고, 이를 굶기는 제작을 제외했습니다.`,criticalIds,rows:kept,filteredIds:source.filter(row=>!kept.includes(row)).map(row=>row.unit.id)};
}
// v16 recovery ladder: when no craft is provable, still name the nearest unit
// that closes each open required role, with its exact missing materials and
// wisp distance.  A silent HOLD is never an acceptable answer.
function recoveryPlan(model,route,locks,assessment,options){
  if(!route||!assessment)return null;
  const limit=options&&options.limit||4,counts=model.effective.counts,open=(assessment.requirements||[]).filter(row=>num(row.gap)>0&&!row.waived);
  if(!open.length)return null;
  const universe=actionUniverse(model,route,locks,assessment,counts),targets=[],seen=new Set();
  for(const req of open){
    const rows=[];
    for(const unit of universe){
      // v17.25: recovery is a "next craft" list.  Already-owned finals are
      // part of the assessment, not valid recovery targets; keeping them here
      // made the compact UI recommend Boa/Ryuma/Bon Kure again at 0 wisp.
      if(num(counts[unit.id])>0)continue;
      const contribution=C.roleContribution(unit,route.mode);if(num(contribution[req.key])<=0)continue;
      const quote=L.quote(model,unit,counts,{availableRound:model.round.value});
      if(!quote.prerequisite.allowed||quote.blocked.some(reason=>/이미 보유|조합 근거 부족|레시피 순환/.test(reason)))continue;
      rows.push({unit,quote,gain:Math.min(num(contribution[req.key]),num(req.gap))});
    }
    rows.sort((a,b)=>Number(b.quote.feasible)-Number(a.quote.feasible)||a.quote.wisp.cost-b.quote.wisp.cost||b.gain-a.gain||nameOf(a.unit).localeCompare(nameOf(b.unit),'ko'));
    const best=rows[0];if(!best||seen.has(best.unit.id))continue;seen.add(best.unit.id);
    const missing=C.commonTop?C.commonTop(model.knowledge.db,best.quote.solve&&best.quote.solve.lowestMissing||{},3).map(item=>({id:item.id,name:item.name,count:num(item.count!=null?item.count:item.need)})):[];
    targets.push({id:best.unit.id,name:nameOf(best.unit),tier:tierOf(best.unit),roleKey:req.key,roleLabel:req.label,gain:round(best.gain),wispCost:num(best.quote.wisp.cost),wispGap:Math.max(0,num(best.quote.wisp.cost)-num(best.quote.wisp.before)),feasible:best.quote.feasible,missing});
    if(targets.length>=limit)break;
  }
  return targets.length?{basis:'nearest-closer-per-open-role',note:options&&options.note||'남은 필수 역할을 닫는 최근접 목표',targets}:null;
}
function expand(model,node,row,route,locks,initial){const quote=L.quote(model,row.unit,node.counts,{availableRound:model.round.value});if(!quote.feasible)return null;const before=ownedFinals(model,node.counts),after=ownedFinals(model,quote.after);if(introducesLineageConflict(model,before,after))return null;const next=nodeBase(model,quote.after,route,locks,initial,node.sequence.concat({quote}));return next;}
function search(model,route,locks){
  const initialAssessment=P.evaluate(model,model.effective.counts,route,{round:model.round.value,locks}),initial=nodeBase(model,model.effective.counts,route,locks,initialAssessment,[]),universe=actionUniverse(model,route,locks,initialAssessment,model.effective.counts),rawPool=candidatePool(model,route,locks,initialAssessment,model.effective.counts,model.round.value,universe),budgetGuard=protectCriticalBudget(model,route,locks,initialAssessment,rawPool,model.effective.counts),basePool=budgetGuard.rows,candidateUnits=basePool.map(row=>row.unit),initialCoverage=futureCoverage(model,initial,route,locks,candidateUnits);initial.coverage=initialCoverage;nodeRank(model,initial,initialAssessment);
  // Coverage is an expensive exact re-quote. First rank all executable nodes
  // by the declarative role/checkpoint vector, then run coverage only for the
  // bounded finalists. This preserves role-diverse candidates from
  // candidatePool while avoiding O(nodes * full-catalog) work on every TMO
  // update.
  let frontier=[];for(const row of basePool){const node=expand(model,initial,row,route,locks,initialAssessment);if(!node)continue;nodeRank(model,node,initialAssessment);frontier.push(node);}frontier.sort(compareNodes);frontier=frontier.slice(0,BEAM_WIDTH*2);for(const node of frontier){node.coverage=futureCoverage(model,node,route,locks,candidateUnits);nodeRank(model,node,initialAssessment);}frontier.sort(compareNodes);let archive=frontier.slice();frontier=frontier.slice(0,BEAM_WIDTH);
  for(let depth=1;depth<HORIZON;depth++){
    const children=[];for(const node of frontier){const pool=candidatePool(model,route,locks,node.assessment,node.counts,model.round.value,candidateUnits).slice(0,16);for(const row of pool){if(node.sequence.some(step=>step.quote.targetId===row.unit.id))continue;const next=expand(model,node,row,route,locks,initialAssessment);if(!next)continue;nodeRank(model,next,initialAssessment);children.push(next);}}
    if(!children.length)break;children.sort(compareNodes);const finalists=children.slice(0,BEAM_WIDTH*2);for(const node of finalists){node.coverage=futureCoverage(model,node,route,locks,candidateUnits);nodeRank(model,node,initialAssessment);}finalists.sort(compareNodes);frontier=finalists.slice(0,BEAM_WIDTH);archive=archive.concat(finalists);
  }
  const byFirst=new Map();for(const node of archive.sort(compareNodes)){const id=node.sequence[0]&&node.sequence[0].quote.targetId;if(id&&!byFirst.has(id))byFirst.set(id,node);}const paths=[...byFirst.values()].sort(compareNodes),best=paths[0]||null;return{initial,initialAssessment,initialCoverage,basePool,rawPool,paths,best,budgetGuard};
}
function requirementDeltas(before,after){const map=new Map((before.requirements||[]).map(row=>[row.key,row]));return(after.requirements||[]).map(row=>{const prior=map.get(row.key)||row,delta=num(row.current)-num(prior.current),gapGain=num(prior.gap)-num(row.gap);return{key:row.key,label:row.label,before:num(prior.current),after:num(row.current),target:num(row.target),delta:round(delta),gapGain:round(gapGain),closed:num(prior.gap)>0&&num(row.gap)<=0};}).filter(row=>Math.abs(row.delta)>1e-9||row.closed);}
function freeNonRegressiveRepair(quote,before,after){
  if(!quote||!quote.feasible||num(quote.wisp&&quote.wisp.cost)>0)return false;
  const prior=new Map((before&&before.requirements||[]).map(row=>[row.key,row]));
  let strictlyImproves=false;
  for(const row of after&&after.requirements||[]){
    const left=prior.get(row.key);if(!left)continue;
    const beforeGap=num(left.gap),afterGap=num(row.gap);
    if(afterGap>beforeGap+1e-9)return false;
    if(afterGap<beforeGap-1e-9)strictlyImproves=true;
  }
  return strictlyImproves;
}
function routeOptions(model){
  const selected=P.resolveRoute(model.intent,model.settings);if(selected)return[selected];
  if(model.intent.damageMode==='magic')return[P.ROUTES.dual,P.ROUTES.singleEnd];
  if(model.intent.damageMode==='physical')return[P.ROUTES.physical];
  return[P.ROUTES.physical,P.ROUTES.dual,P.ROUTES.singleEnd];
}
function rolePotential(unit,route){const contribution=C.roleContribution(unit,route.mode);let score=0;for(let index=0;index<route.groups.length;index++){const weight=Math.max(1,route.groups.length-index);for(const key of route.groups[index])score+=weight*Math.min(1,num(contribution[key]));}return round(score);}
function routeCandidateCompare(left,right){
  const a=left.rankVector||[],b=right.rankVector||[],length=Math.max(a.length,b.length);for(let index=0;index<length;index++){const delta=num(a[index])-num(b[index]);if(Math.abs(delta)>1e-9)return delta;}return nameOf(left.unit).localeCompare(nameOf(right.unit),'ko')||String(left.id).localeCompare(String(right.id));
}
function remainingOverlap(model,unit,counts){let penalty=0,densePairs=0;for(const existing of ownedFinals(model,counts)){if(existing.id===unit.id)continue;const pair=pairMaterialOverlap(model,unit,existing);if(pair.denseRare)densePairs++;penalty+=pair.penalty;}return{penalty:round(penalty),densePairs};}
function lineupOverlap(model,lineup){let penalty=0,densePairs=0;for(let left=0;left<(lineup||[]).length;left++)for(let right=left+1;right<lineup.length;right++){const pair=pairMaterialOverlap(model,lineup[left],lineup[right]);if(pair.denseRare)densePairs++;penalty+=pair.penalty;}return{penalty:round(penalty),densePairs};}
function safeRoleImprovement(before,after){
  const prior=new Map((before&&before.requirements||[]).map(row=>[row.key,row]));let improved=false;
  for(const row of after&&after.requirements||[]){const left=prior.get(row.key);if(!left)continue;if(num(row.gap)>num(left.gap)+1e-9)return false;if(num(row.gap)+1e-9<num(left.gap))improved=true;}
  return improved;
}
function supportNodeRank(node){const tier=node.resources.tiers,overlap=node.overlap||{penalty:0,densePairs:0};node.rankVector=[].concat(node.assessment.fullVector,[-num(tier.rare),-num(tier.special),-num(tier.uncommon),-num(tier.common),num(node.resources.wisp),num(node.warpedCount),num(overlap.densePairs),num(overlap.penalty)]);return node.rankVector;}
function compareSupportNodes(left,right){const vector=P.compareVector(left.rankVector,right.rankVector);if(vector)return vector;return(left.steps||[]).map(step=>step.quote.targetId).join('|').localeCompare((right.steps||[]).map(step=>step.quote.targetId).join('|'));}
function makeSupportNode(model,counts,assessment,steps,warpedCount){const resources=resourceTotals(steps),overlap=lineupOverlap(model,ownedFinals(model,counts)),node={counts,assessment,steps,resources,warpedCount:num(warpedCount),overlap,rankVector:[]};supportNodeRank(node);return node;}
function supportUniverse(model,route,locks,counts,assessment){
  const beforeLineup=ownedFinals(model,counts),lock=lockedUpper(locks),staticRows=allCandidates(model,route,locks,counts).map(unit=>{const potential=potentialScore(unit,assessment,route,lock),profile=recipeProfile(model,unit);return{unit,potential,profile};}).filter(row=>row.potential>0).sort((left,right)=>right.potential-left.potential||sum(right.profile.rare)-sum(left.profile.rare)||sum(right.profile.special)-sum(left.profile.special)||num(model.effective.percent[right.unit.id])-num(model.effective.percent[left.unit.id])||nameOf(left.unit).localeCompare(nameOf(right.unit),'ko')).slice(0,SUPPORT_STATIC_PROBE_CAP),rows=[];for(const prepared of staticRows){const unit=prepared.unit,quote=L.quote(model,unit,counts,{availableRound:model.round.value});if(!quote.feasible||introducesLineageConflict(model,beforeLineup,ownedFinals(model,quote.after)))continue;const after=P.evaluate(model,quote.after,route,{round:model.round.value,locks});if(!safeRoleImprovement(assessment,after))continue;const tiers=quote.tiers&&quote.tiers.totals||{},potential=prepared.potential;rows.push({unit,quote,after,potential,tiers,warpedRequired:!!(C.requiresWarpedCraft&&C.requiresWarpedCraft(model.knowledge.db,unit,counts))});}
  rows.sort((left,right)=>P.compareVector(left.after.fullVector,right.after.fullVector)||right.potential-left.potential||-num(left.tiers.rare)+num(right.tiers.rare)||-num(left.tiers.special)+num(right.tiers.special)||-num(left.tiers.uncommon)+num(right.tiers.uncommon)||-num(left.tiers.common)+num(right.tiers.common)||left.quote.wisp.cost-right.quote.wisp.cost||nameOf(left.unit).localeCompare(nameOf(right.unit),'ko'));return rows.slice(0,SUPPORT_CANDIDATE_CAP);
}
function projectSupportPrefix(model,row,route){
  // v17.12: 특수재료 게이트 상위의 quote는 크레딧 재시도 값이므로 정확
  // 원장에서 재생 불가 — 확정 제작 경로(exactPrefix)로 승격하지 않는다.
  if(!row.quote||!row.quote.feasible||row.specialGate)return{steps:[],supportSteps:[],assessment:null,tiers:{rare:0,special:0,uncommon:0,common:0},wispUsed:0,remainingWisp:num(row.quote&&row.quote.wisp&&row.quote.wisp.before),requiredUpperWisp:num(row.quote&&row.quote.wisp&&row.quote.wisp.cost),wispDebt:Math.max(0,num(row.quote&&row.quote.wisp&&row.quote.wisp.cost)-num(row.quote&&row.quote.wisp&&row.quote.wisp.before)),deadEnds:[],affordableCount:0,exactPrefix:false,basis:row.specialGate?'special-material-gated':'upper-not-currently-craftable'};
  const locks=[{stage:'upper',id:row.id,source:'v15-route-projection'}],initialAssessment=P.evaluate(model,row.quote.after,route,{round:model.round.value,locks}),initial=makeSupportNode(model,row.quote.after,initialAssessment,[],row.warped&&row.warped.required?1:0),universe=supportUniverse(model,route,locks,initial.counts,initial.assessment),candidateUnits=universe.map(item=>item.unit);let frontier=[],archive=[];
  for(const item of universe){const node=makeSupportNode(model,item.quote.after,item.after,[{quote:item.quote}],initial.warpedCount+(item.warpedRequired?1:0));frontier.push(node);}frontier.sort(compareSupportNodes);archive=frontier.slice();frontier=frontier.slice(0,SUPPORT_BEAM_WIDTH);
  for(const node of frontier){for(const item of universe){if(node.steps.some(step=>step.quote.targetId===item.unit.id))continue;const quote=L.quote(model,item.unit,node.counts,{availableRound:model.round.value});if(!quote.feasible||introducesLineageConflict(model,ownedFinals(model,node.counts),ownedFinals(model,quote.after)))continue;const after=P.evaluate(model,quote.after,route,{round:model.round.value,locks});if(!safeRoleImprovement(node.assessment,after))continue;archive.push(makeSupportNode(model,quote.after,after,node.steps.concat({quote}),node.warpedCount+(C.requiresWarpedCraft&&C.requiresWarpedCraft(model.knowledge.db,item.unit,node.counts)?1:0)));}}
  archive.sort(compareSupportNodes);const best=archive[0]||initial,coverage=futureCoverage(model,{counts:best.counts,assessment:best.assessment},route,locks,candidateUnits),allSteps=[{quote:row.quote}].concat(best.steps),cumulative=resourceTotals(allSteps),supportSteps=best.steps.map((step,index)=>({order:index+1,id:step.quote.targetId,name:nameOf(step.quote.unit),wispCost:num(step.quote.wisp.cost),wispAfter:num(step.quote.wisp.after),tiers:Object.assign({rare:0,special:0,uncommon:0,common:0},step.quote.tiers&&step.quote.tiers.totals||{})}));
  return{steps:allSteps,supportSteps,assessment:best.assessment,tiers:cumulative.tiers,wispUsed:cumulative.wisp,remainingWisp:num(best.counts[C.WISP_ID]),requiredUpperWisp:num(row.quote.wisp.cost),wispDebt:0,deadEnds:coverage.deadEnds,affordableCount:coverage.affordableCount,warpedCount:best.warpedCount,materialOverlap:best.overlap,exactPrefix:true,basis:'upper-plus-up-to-two-exact-supports'};
}
function story10RewardOpen(model){
  // 스토리 10 확정 보상(레일리(히든)+해적선)은 사용자가 다른 보상(초월
  // 쿠마·상자)을 선언하지 않은 동안만 계획에 넣을 수 있다.
  const choice=String(model.settings&&model.settings.story10Reward||'');
  return choice===''||choice==='rayleigh';
}
function upperRouteRow(model,unit,route){
  const counts=model.effective.counts;let quote=L.quote(model,unit,counts,{availableRound:model.round.value}),storyReward=false;
  // v17.5: 레일리(히든)·해적선만 막힌 상위(예: 핸콕 영원)는 스토리 10
  // 보상 수령을 전제로 방향 후보에 남긴다.  전설·희귀 완성 단계에는
  // 절대 적용하지 않는다 — 초반에는 레일리를 도박 말고 얻을 길이 없다.
  if((!quote.prerequisite.allowed||quote.blocked.length)&&story10RewardOpen(model)){
    const credited=Object.assign({},counts);
    credited[C.RAYLEIGH_HIDDEN_ID]=num(credited[C.RAYLEIGH_HIDDEN_ID])+1;
    credited[C.PIRATE_SHIP_ID]=num(credited[C.PIRATE_SHIP_ID])+1;
    const retry=L.quote(model,unit,credited,{availableRound:model.round.value});
    if(retry.prerequisite.allowed&&!retry.blocked.length){quote=retry;storyReward=true;}
  }
  // v17.12(사용자 요청): 그린블러드처럼 레시피 없는 특수재료 하나에만
  // 막힌 상위(베가펑크 4종)는 숨기지 않고 "그린블러드 필요" 게이트
  // 배지와 함께 방향 후보에 남긴다. 제작 승인(ACT_NOW)은 실제 보유
  // 전까지 불가 — 방향 비교·파티 계획에서만 보인다. 상위 방향 단계
  // 전용이며 전설·희귀 완성 단계에는 적용하지 않는다.
  let specialGate=null;
  if(!storyReward&&!quote.prerequisite.allowed&&Array.isArray(quote.prerequisite.missing)&&quote.prerequisite.missing.length){
    const missing=quote.prerequisite.missing;
    const allZeroRecipeSpecials=missing.every(item=>{
      if(item.kind!=='special')return false;
      const material=model.knowledge.db.byId.get(item.id);
      return material&&!(material.stuffs||[]).length;
    });
    if(allZeroRecipeSpecials){
      const credited=Object.assign({},counts);
      for(const item of missing)credited[item.id]=num(credited[item.id])+num(item.count||1);
      const retry=L.quote(model,unit,credited,{availableRound:model.round.value});
      if(retry.prerequisite.allowed&&!retry.blocked.length){quote=retry;specialGate={items:missing.map(item=>({id:String(item.id),name:String(item.name||item.id),count:num(item.count||1)}))};}
    }
  }
  // Missing special items, exhausted one-off resources, malformed recipes and
  // other hard rules are not a recommendation. A finite wisp shortage is the
  // only reason an unfinished upper may remain as a direction commitment.
  if(!quote.prerequisite.allowed||quote.blocked.length)return null;
  const beforeLineup=ownedFinals(model,counts),afterLineup=ownedFinals(model,quote.after);if(introducesLineageConflict(model,beforeLineup,afterLineup))return null;
  const temporaryLocks=[{stage:'upper',id:unit.id,source:'v15-route-projection'}],projected=quote.feasible?P.evaluate(model,quote.after,route,{round:model.round.value,locks:temporaryLocks}):null,tiers=Object.assign({rare:0,special:0,uncommon:0,common:0},quote.tiers&&quote.tiers.totals||{}),inventory=M.tierInventory(model,counts),warpedRequired=!!(C.requiresWarpedCraft&&C.requiresWarpedCraft(model.knowledge.db,unit,counts)),profile=recipeProfile(model,unit),overlap=remainingOverlap(model,unit,quote.after),completion=num(model.effective.percent[unit.id]),wispGap=Math.max(0,num(quote.wisp.cost)-num(quote.wisp.before)),potential=rolePotential(unit,route),powerTier=C&&typeof C.upperPowerTier==='function'?C.upperPowerTier(unit,model.knowledge.db):{known:false,letter:'',rank:-1},projectedVector=projected?projected.fullVector:[99,99,99,99],rankVector=[quote.feasible?0:1].concat(projectedVector,[-num(tiers.rare),-num(tiers.special),-num(tiers.uncommon),-num(tiers.common),wispGap,num(quote.wisp.cost),warpedRequired?1:0,num(profile.warpedNodes.size),num(overlap.penalty),-potential,-completion]),uses=`희귀 ${num(tiers.rare)}/${num(inventory.rare&&inventory.rare.total)} · 특별 ${num(tiers.special)}/${num(inventory.special&&inventory.special.total)} · 안흔 ${num(tiers.uncommon)}/${num(inventory.uncommon&&inventory.uncommon.total)}`;
  return{id:unit.id,name:nameOf(unit),unit,routeKey:route.key,routeLabel:route.label,mode:route.mode,powerTier,locked:false,keepUpper:false,canCommit:true,feasible:quote.feasible&&!storyReward&&!specialGate,storyReward,specialGate,quote,completion:round(completion,1),wispCost:num(quote.wisp.cost),wispAfter:quote.feasible?num(quote.wisp.after):null,wispGap,tiers,upperTiers:Object.assign({},tiers),tierAvailable:{rare:num(inventory.rare&&inventory.rare.total),special:num(inventory.special&&inventory.special.total),uncommon:num(inventory.uncommon&&inventory.uncommon.total),common:num(inventory.common&&inventory.common.total)},warped:{required:warpedRequired,nodes:num(profile.warpedNodes.size),costReflectedInWisp:true},materialOverlap:overlap,rolePotential:potential,projectedAssessment:projected,rankVector,reason:`현재 패 정확 원장: ${uses} · 선택위습 ${num(quote.wisp.cost)}${wispGap?` (현재 ${wispGap} 부족)`:''}${warpedRequired?' · 왜곡 제작 비용 포함':''}${storyReward?` · 스토리 10 보상(레일리+해적선) 수령 전제 — ${C.STORY10_FORFEITS} 포기`:''}${specialGate?` · ${specialGate.items.map(item=>item.name).join('·')} 확보 전제(미보유 특수재료)`:''}.`,evidence:{ledger:'exact-current-stock',specialPrerequisite:storyReward?'story10-reward-planned':'observed',upperEquivalent:3,fixedFinalParty:false,combat:'unmeasured'}};
}
function lockedMagicRouteRows(model,lock){
  const unit=model.knowledge.db.byId.get(lock&&lock.id);if(!unit||C.familyOf(unit)!=='magic')return[];
  return[P.ROUTES.dual,P.ROUTES.singleEnd].map(route=>{const assessment=P.evaluate(model,model.effective.counts,route,{round:model.round.value,locks:[lock]}),rankVector=assessment.checkpointVector.concat(assessment.fullVector),powerTier=C&&typeof C.upperPowerTier==='function'?C.upperPowerTier(unit,model.knowledge.db):{known:false,letter:'',rank:-1};return{id:unit.id,name:nameOf(unit),unit,powerTier,routeKey:route.key,routeLabel:route.label,mode:'magic',locked:true,keepUpper:true,canCommit:true,feasible:true,quote:null,completion:round(num(model.effective.percent[unit.id]),1),wispCost:0,wispAfter:num(model.effective.counts[C.WISP_ID]),wispGap:0,tiers:{rare:0,special:0,uncommon:0,common:0},tierAvailable:{},warped:{required:false,nodes:0,costReflectedInWisp:true},materialOverlap:{penalty:0,densePairs:0},rolePotential:0,projectedAssessment:assessment,rankVector,reason:`고정 상위 ${nameOf(unit)}는 유지합니다. 현재 보유 역할만 ${route.label} 기준으로 다시 계산했습니다.`,evidence:{ledger:'no-craft-route-choice',keptUpperLock:true,fixedFinalParty:false,combat:'unmeasured'}};}).sort(routeCandidateCompare);
}
function projectUpperRouteRow(model,row,route){
  const projection=projectSupportPrefix(model,row,route),exact=projection.exactPrefix===true,tiers=exact?Object.assign({rare:0,special:0,uncommon:0,common:0},projection.tiers):Object.assign({rare:0,special:0,uncommon:0,common:0},row.upperTiers||row.tiers),assessment=projection.assessment||row.projectedAssessment,roleVector=assessment?assessment.fullVector:[99,99,99,99],overlap=projection.materialOverlap||row.materialOverlap||{penalty:0,densePairs:0},warpedCount=num(projection.warpedCount)+(projection.warpedCount==null&&row.warped&&row.warped.required?1:0),support=exact?projection.supportSteps||[]:[],stepSummary=exact?[{order:1,kind:'upper',id:row.id,name:row.name,wispCost:num(row.quote&&row.quote.wisp.cost),wispAfter:num(row.quote&&row.quote.wisp.after),tiers:Object.assign({},row.upperTiers||row.tiers)}].concat(support.map((step,index)=>Object.assign({},step,{order:index+2,kind:'support'}))):[],wispUsed=exact?num(projection.wispUsed):num(row.quote&&row.quote.wisp&&row.quote.wisp.cost),rankVector=[row.feasible?0:1,num((projection.deadEnds||[]).length)].concat(roleVector,[-num(tiers.rare),-num(tiers.special),-num(tiers.uncommon),-num(tiers.common),num(row.wispGap),wispUsed,warpedCount,num(overlap.densePairs),num(overlap.penalty),-num(row.completion)]),supportNames=support.map(step=>step.name).join(' → '),reason=exact?`상위+현재 패 확정 경로: ${row.name}${supportNames?` → ${supportNames}`:''} · 희귀 ${num(tiers.rare)} · 특별 ${num(tiers.special)} · 안흔 ${num(tiers.uncommon)} · 누적 선위 ${wispUsed}${projection.deadEnds&&projection.deadEnds.length?` · 이후 막힌 역할 ${projection.deadEnds.map(item=>item.label).slice(0,2).join(' / ')}`:''}${row.warped&&row.warped.required?' · 왜곡 비용 포함':''}.`:`방향 후보: ${row.name} · 현재 제작 선위 ${num(projection.requiredUpperWisp)} 필요, ${num(projection.wispDebt)} 부족. 확정 제작 경로로 표시하지 않습니다.`,
  reasonWithStory=(row.storyReward?`${reason} · 스토리 10 보상(레일리+해적선) 수령 전제 — ${C.STORY10_FORFEITS} 포기.`:reason)+(row.specialGate?` · ${row.specialGate.items.map(item=>item.name).join('·')} 확보 전제(미보유 특수재료).`:'');
  return Object.assign({},row,{tiers,wispCost:wispUsed,wispAfter:exact?projection.remainingWisp:null,projectedAssessment:assessment,materialOverlap:overlap,rankVector,reason:reasonWithStory,projectedSupport:{basis:projection.basis,exactPrefix:exact,steps:stepSummary,supportSteps:support,tiers:exact?projection.tiers:{rare:0,special:0,uncommon:0,common:0},wispUsed:exact?num(projection.wispUsed):0,remainingWisp:projection.remainingWisp,requiredUpperWisp:num(projection.requiredUpperWisp),wispDebt:num(projection.wispDebt),deadEnds:projection.deadEnds||[],affordableCount:num(projection.affordableCount),futureDropsCredited:false,fixedFinalParty:false,combat:'unmeasured'}});
}
function upperProjectionShortlist(rows,route){const sorted=(rows||[]).slice().sort(routeCandidateCompare),picked=sorted.slice(0,UPPER_PROJECTION_SHORTLIST),seen=new Set(picked.map(row=>C.canonicalUpperId(row.id)));for(const key of [...new Set((route.groups||[]).flat())]){const best=sorted.filter(row=>num(C.roleContribution(row.unit,route.mode)[key])>0).sort((left,right)=>num(C.roleContribution(right.unit,route.mode)[key])-num(C.roleContribution(left.unit,route.mode)[key])||routeCandidateCompare(left,right))[0];if(best&&!seen.has(C.canonicalUpperId(best.id))){seen.add(C.canonicalUpperId(best.id));picked.push(best);}if(picked.length>=UPPER_PROJECTION_CAP)break;}return picked.slice(0,UPPER_PROJECTION_CAP);}
// v17.3: 종착점 클리어 가치 — "지금 가까운 상위"가 아니라 "클리어에
// 유리한 상위"가 앞서도록 하는 현재주의 교정.  근거는 전부 실측 데이터:
// 스토리 실측 랭크, 평타+스킬 하한 DPS의 60라 필요치 대비, 라인 자립도
// (보유 조합의 보조딜로 상쇄), 보유 희귀 활용률.  50라 준비 창을 넘기는
// 도달 시점은 강하게 할인한다 — 시간이 없을 때만 현재주의가 옳다.
function clearValueScore(model,row){
  const unit=row.unit;
  const preview=C.bossPreview?C.bossPreview(60,model.settings.gorosei):null;
  let dpsCover=0;
  if(preview&&preview.bossArmor!=null&&C.upperBossDps){
    const level=Math.max(1,num(model.settings.upperResearchLevel)||1);
    const combat=C.upperBossDps(unit,level,{bossArmor:preview.bossArmor,armorReduce:180});
    const proc=C.upperSkillProcDps?C.upperSkillProcDps(unit,level,{bossArmor:preview.bossArmor,armorReduce:180}):null;
    // v17.21: 미검증 프로필은 신뢰도로 감산한 값을 순위에 넣는다.
    if(combat)dpsCover=Math.min(1.2,(combat.effective+(proc?num(proc.trustedDps!=null?proc.trustedDps:proc.dps):0))/Math.max(1,num(preview.dpsNeed)));
  }
  const strategy=C.upperStrategy(unit);
  let line=.5;
  if(strategy.lineSelf==='self')line=1;
  else if(strategy.lineSelf==='support')line=ownedFinals(model,model.effective.counts).some(owned=>C.roleProfile(owned).supportDamage)?.6:.2;
  const rareUtil=num(row.tierAvailable&&row.tierAvailable.rare)>0?Math.min(1,num(row.tiers&&row.tiers.rare)/num(row.tierAvailable.rare)):0;
  // 유틸 킷(스턴·이감·방깎)은 DPS 하한에 잡히지 않는 실전 가치다 —
  // 핸콕 영원류 유틸 상위가 저평가되지 않게 별도 축으로 넣는다.
  const kit=C.roleProfile(unit),utility=Math.min(1,.4*Math.min(1,num(kit.stun)/1.5)+.3*Math.min(1,(num(kit.slow)+num(kit.triggerSlow))/60)+.3*Math.min(1,(num(kit.armor)+num(kit.triggerArmor))/60));
  // 선위 부족 → 예상 라운드: 드랍이 트리 재료를 직접 채우므로 순수 선위
  // 구매 가정보다 훨씬 빠르다.  실측 로그 기준(예: 크로커다일 r33 선택 →
  // r38 완성, 선위환산 ~20/5라) 라운드당 4선위 환산으로 본다.
  const roundsToGo=row.feasible?0:Math.ceil(num(row.wispGap)/4);
  const eta=model.round.value+roundsToGo;
  const deadlineFactor=eta<=47?1:eta<=52?.6:eta<=58?.35:.15;
  // v17.26(사용자 재확인, 3회차): story를 상위 점수에서 뺀다.  스토리
  // 등급표 스스로 "스토리 파괴 속도 비교이지 악몽 클리어 확률이 아니다"
  // 라고 선언했고, v17.18에서 최종 파티 타이브레이크에서, v17.21에서
  // 행동 선택(nodeRank)에서 이미 제거했다.  상위도 최종 파티의 일부이니
  // 같은 기준을 적용한다.  30%를 나머지 축에 재배분한다.
  const base=(.45*dpsCover+.2*utility+.2*rareUtil+.15*line)*deadlineFactor;
  // v17.13: 실측 픽 판수의 로그 스케일 보조 타이브레이크.  상한 0.02에
  // deadlineFactor를 곱해 할인 구간에서도 비중이 커지지 않게 한다 — 원장
  // 기반 부분점수(story 0.3 등)의 1/15 수준이라 동률 근처에서만 순서를
  // 바꿀 수 있다.  실측이 없거나 모듈이 없으면 0.
  const meta=metaEvidence(unit);
  const metaBonus=meta?Math.min(META_TIEBREAK_CAP,.004*Math.log10(1+meta.games))*deadlineFactor:0;
  const value=base+metaBonus;
  return{value:round(value,4),dpsCover:round(dpsCover,3),line:round(line,2),rareUtil:round(rareUtil,3),utility:round(utility,3),roundsToGo,deadlineFactor,metaGames:meta?meta.games:0,metaShare:meta?meta.share:0,metaBonus:round(metaBonus,4)};
}
function clearValueCompare(left,right){
  const delta=num(right.clearValue&&right.clearValue.value)-num(left.clearValue&&left.clearValue.value);
  if(Math.abs(delta)>1e-9)return delta;
  return routeCandidateCompare(left,right);
}
function plannerState(model){
  const effective=model&&model.effective||{},knowledge=model&&model.knowledge||{};
  return{db:knowledge.db,units:knowledge.units||knowledge.db&&knowledge.db.units||[],counts:clone(effective.counts),rawCounts:clone(effective.rawCounts||effective.counts),currentAbilities:clone(effective.currentAbilities),percent:clone(effective.percent),wisp:num(effective.counts&&effective.counts[C.WISP_ID])};
}
function blueprintSupportRows(model,ranking){
  const plan=ranking&&ranking.plan||{},actionById=new Map(),rows=[],seen=new Set(),memoById=new Map((ranking&&ranking.memoPackage&&ranking.memoPackage.hits||[]).map(item=>[String(item.id),item]));
  for(const action of [].concat(plan.safePrefix&&plan.safePrefix.actions||[],plan.actions||[]))if(action&&action.id&&!actionById.has(action.id))actionById.set(action.id,action);
  for(const item of plan.finalLineup||[]){
    // Worker compact rows used to carry `{unit:{id}}`.  That truthy stub won
    // over the real catalog row, so support names/roles became blank and an
    // Upper could even leak into its own support list.  Resolve by id first;
    // use an embedded unit only when the catalog genuinely has no row.
    const id=String(item&&item.id||item&&item.unit&&item.unit.id||''),unit=model.knowledge.db.byId.get(id)||item&&item.unit;
    if(!unit||!id||C.isUpper(unit)||pseudoUnit(unit)||seen.has(id))continue;
    seen.add(id);const action=actionById.get(id),role=C.summarizeRoles?C.summarizeRoles({role:C.roleProfile(unit)},plan.mode):'',memo=memoById.get(id);
    rows.push({id,name:nameOf(unit),status:String(item.status||action&&'planned'||'future'),role,wispCost:num(action&&action.wispCost),order:rows.length+1,memoMatched:!!memo,memoRank:num(memo&&memo.rank),memoReason:String(memo&&memo.reason||'')});
  }
  return rows.sort((left,right)=>Number(right.memoMatched)-Number(left.memoMatched)||(left.memoRank||999)-(right.memoRank||999)||left.order-right.order).slice(0,3).map((row,index)=>Object.assign({},row,{displayOrder:index+1}));
}
function integratedUpperCompare(left,right){
  const ar=num(left.blueprintEvaluation&&left.blueprintEvaluation.rank),br=num(right.blueprintEvaluation&&right.blueprintEvaluation.rank);
  if(ar&&br&&ar!==br)return ar-br;
  if(ar!==br)return ar? -1:1;
  const projected=routeCandidateCompare(left,right);if(projected)return projected;
  return clearValueCompare(left,right);
}
// v17.21: 9환산 전체 파티 계획은 후보 하나당 ~250ms다.  숏리스트 8개를
// 전부 계획하면 방향 미확정 구간의 E.decide가 2.8초까지 늘어나고(기존
// 0.7~0.9초) 그게 메인 스레드다 — 제작·리롤·드랍으로 패가 바뀔 때마다
// 다시 걸린다.  상위 몇 개만 실제로 계획하고 나머지는 투영 순서를
// 유지한다.  계획된 후보가 항상 위에 오므로 목록 상단(사용자가 실제로
// 고르는 구간)은 그대로다.
const UPPER_BLUEPRINT_PLAN_CAP=3;
const UPPER_BLUEPRINT_TIER_PROBE=2;
const UPPER_BLUEPRINT_ANGLE_PROBE=2;
function currentHandAngleMetrics(row){
  const quote=row&&row.quote||{},rareUse=quote.rareUse||{},rareTypes=Object.values(rareUse).filter(value=>num(value)>0).length,rareUsed=Object.values(rareUse).reduce((sum,value)=>sum+Math.max(0,num(value)),0),wispCost=num(row&&row.wispCost!=null?row.wispCost:quote.wisp&&quote.wisp.cost),tier=row&&row.powerTier||{};
  return{eligible:!!(quote.feasible&&rareUsed>0&&wispCost<24),rareUsed,rareTypes,wispCost,wispBand:wispCost<=num(C.PREFERRED_WISP_COST||10)?2:1,tierRank:tier.known?num(tier.rank):-1};
}
function currentHandAngleCompare(left,right){
  const a=currentHandAngleMetrics(left),b=currentHandAngleMetrics(right);
  if(a.tierRank!==b.tierRank)return b.tierRank-a.tierRank;
  if(a.wispBand!==b.wispBand)return b.wispBand-a.wispBand;
  if(a.rareTypes!==b.rareTypes)return b.rareTypes-a.rareTypes;
  if(a.rareUsed!==b.rareUsed)return b.rareUsed-a.rareUsed;
  if(a.wispCost!==b.wispCost)return a.wispCost-b.wispCost;
  return clearValueCompare(left,right);
}
function currentHandAngleProbes(rows,limit=2){
  const sorted=(rows||[]).filter(row=>currentHandAngleMetrics(row).eligible).sort(currentHandAngleCompare),out=[],seenTier=new Set(),seenId=new Set();
  for(const row of sorted){const tier=String(row&&row.powerTier&&row.powerTier.letter||'?');if(seenTier.has(tier))continue;seenTier.add(tier);seenId.add(String(row.id));out.push(row);if(out.length>=limit)return out;}
  for(const row of sorted){if(seenId.has(String(row.id)))continue;seenId.add(String(row.id));out.push(row);if(out.length>=limit)break;}
  return out;
}
// 계획 전 예비 정렬 — 티어를 먼저 본다.  낮은 티어가 "가깝다"는 이유로
// 고티어 후보를 계획 대상에서 밀어내면 티어 축 자체가 무너진다.
// 승격 폭(최대 +2)을 감안해 최고 티어 −2단계까지는 계획 후보로 남긴다.
function blueprintPlanPreorder(a,b){
  const at=a&&a.powerTier||{},bt=b&&b.powerTier||{};
  if(at.known&&bt.known&&num(at.rank)!==num(bt.rank))return num(bt.rank)-num(at.rank);
  if(!!at.known!==!!bt.known)return at.known?-1:1;
  return clearValueCompare(a,b);
}
function blueprintPlanTargets(rows){
  const ordered=rows.slice().sort(blueprintPlanPreorder);
  const known=ordered.filter(row=>row&&row.powerTier&&row.powerTier.known);
  const bestRank=known.length?num(known[0].powerTier.rank):null;
  const targets=[],seen=new Set();
  const hardCap=UPPER_BLUEPRINT_PLAN_CAP+UPPER_BLUEPRINT_TIER_PROBE+UPPER_BLUEPRINT_ANGLE_PROBE;
  const take=(row,cap=UPPER_BLUEPRINT_PLAN_CAP)=>{if(!row||seen.has(row.id)||targets.length>=cap)return;seen.add(row.id);targets.push(row);};
  for(const row of ordered)take(row);
  // 승격으로 뒤집힐 수 있는 하위 티어(최고 −1, −2)가 잘렸다면 한 자리를
  // 내준다 — angleBand 승격이 실제로 작동하려면 그 후보도 계획돼야 한다.
  if(bestRank!=null)for(const step of [1,2]){
    if(targets.some(row=>num(row.powerTier.rank)===bestRank-step))continue;
    const candidate=ordered.find(row=>row&&row.powerTier&&row.powerTier.known&&num(row.powerTier.rank)===bestRank-step&&!seen.has(row.id));
    if(candidate)take(candidate,UPPER_BLUEPRINT_PLAN_CAP+UPPER_BLUEPRINT_TIER_PROBE);
  }
  // 티어·투영 순서 밖에 있더라도 현재 보유 희귀를 직접 비우며 24선위
  // 미만인 상위는 반드시 전체 파티 검사를 받는다. 이 probe가 없으면
  // R30의 카이도처럼 A티어 3희귀·6선위 실제 각이 shortlist 단계에서
  // 잘리고, 희귀를 전혀 안 쓰는 S티어 미래안만 화면에 남는다.
  for(const row of currentHandAngleProbes(ordered,UPPER_BLUEPRINT_ANGLE_PROBE))take(row,hardCap);
  return{targets,rest:ordered.filter(row=>!seen.has(row.id))};
}
// 계획된 후보와 계획 안 된 후보가 한 목록에 섞일 때 쓰는 비교자.
//  - 둘 다 계획됨: 전체 파티 비교(안전 → 티어 → 각 …) 그대로.
//  - 둘 다 미계획: 티어 우선 예비 정렬.
//  - 한쪽만 계획됨: 티어를 먼저 본다.  아니면 "계획됐다"는 이유만으로
//    낮은 티어가 높은 티어 위로 올라가는 표시 아티팩트가 생긴다.
function planFlag(row){return num(row&&row.blueprintEvaluation&&row.blueprintEvaluation.rank)>0?1:0;}
function plainTierRank(row){
  const tier=row&&row.powerTier||{};
  if(!tier.known)return null;
  return row&&row.effectiveTierRank!=null&&num(row.effectiveTierRank)>=0?num(row.effectiveTierRank):num(tier.rank);
}
function mixedPlanCompare(left,right){
  const lp=planFlag(left),rp=planFlag(right);
  if(lp&&rp)return integratedUpperCompare(left,right);
  if(!lp&&!rp)return blueprintPlanPreorder(left,right);
  const lt=plainTierRank(left),rt=plainTierRank(right);
  if(lt!=null&&rt!=null&&lt!==rt)return rt-lt;
  return rp-lp;
}
// v17.22: 전체 파티 계획을 메인 스레드 밖에서 미리 돌릴 수 있게 한다.
// settings._blueprintRankings[routeKey]에 upperId → ranking 맵이 오면
// 플래너를 부르지 않고 그 결과를 그대로 쓴다(앱이 ord_direction_worker
// 에서 계산해 넣는다).  주입값이 없고 _blueprintPlanSync가 false면
// 계획을 아예 건너뛰고 투영+티어 순서만 쓴다 — 워커 결과가 도착하기
// 전의 첫 렌더가 여기 해당하며, 도착하면 같은 목록이 재정렬된다.
function injectedBlueprintRankings(model,route){
  const bag=model&&model.settings&&model.settings._blueprintRankings;
  if(!bag||typeof bag!=='object')return null;
  const lane=bag[route&&route.key]||bag[route&&route.mode];
  if(!lane||typeof lane!=='object')return null;
  const map=new Map();
  for(const [id,item] of Object.entries(lane))if(item&&typeof item==='object')map.set(String(id),item);
  return map.size?map:null;
}
function applyBlueprintRanking(model,route,rows){
  if(!rows.length)return rows.slice().sort(integratedUpperCompare);
  const settings=Object.assign({},model.settings,{mode:route.mode,magicRoute:route.key,currentRound:model.round.value,targetSquadCount:9,targetLegendEquivalent:9,upperPreviewId:'',preferredLineupIds:[]});
  const injected=injectedBlueprintRankings(model,route);
  const planSync=model&&model.settings&&model.settings._blueprintPlanSync;
  if(!injected&&(planSync===false||!S||typeof S.rankUpperBlueprints!=='function'))
    return rows.map(row=>Object.assign({},row,{angleLabel:'미평가',angleBand:0,tierPromotion:0,effectiveTierRank:row.powerTier&&row.powerTier.known?num(row.powerTier.rank):-1,blueprintEvaluation:{basis:'route-projection-only',planned:false,rank:0,powerTier:row.powerTier||{known:false,letter:'',rank:-1},angleLabel:'미평가',angleBand:0,tierPromotion:0,note:'전체 파티 계획은 백그라운드에서 계산 중입니다.'}})).sort(blueprintPlanPreorder);
  // In a Worker-injected pass the expensive work is already off the main
  // thread.  Consume every returned candidate instead of throwing away the
  // fourth/sixth result and leaving a selectable "미평가" card.
  const plannedSplit=blueprintPlanTargets(rows),planTargets=injected?rows.filter(row=>injected.has(String(row.id))):plannedSplit.targets,plannedIds=new Set(planTargets.map(row=>String(row.id))),planRest=rows.filter(row=>!plannedIds.has(String(row.id)));
  if(!planTargets.length)return rows.slice().sort(integratedUpperCompare);
  try{
    const runtime=typeof window!=='undefined'?window:globalThis,ranked=injected?planTargets.map(row=>injected.get(String(row.id))).filter(Boolean):S.rankUpperBlueprints({state:plannerState(model),settings,locks:[],upperMemo:runtime.ORD_UPPER_MEMO,synergyMemo:runtime.ORD_SYNERGY_MEMO},{candidateIds:planTargets.map(row=>row.id)})||[],byId=new Map(ranked.map(item=>[String(item.upperId),item]));
    const decorated=planTargets.map(row=>{
      const item=byId.get(String(row.id));if(!item)return row;
      const plan=item.plan||{},planned=plan.roleCoverage&&plan.roleCoverage.planned||{},summary=plan.rareSummary||{};
      return Object.assign({},row,{powerTier:item.powerTier||row.powerTier,safetyBand:num(item.safetyBand),angleBand:num(item.angleBand),angleLabel:String(item.angleLabel||''),tierPromotion:num(item.tierPromotion),effectiveTierRank:num(item.effectiveTierRank),memoPackage:item.memoPackage||null,blueprintEvaluation:{basis:'upper-plus-support-full-squad',rank:num(item.rank),roleComplete:!!item.roleComplete,clearComplete:!!item.clearComplete,readiness:num(item.readiness),plannedEquivalent:num(plan.plannedCount),targetEquivalent:num(plan.targetCount)||9,plannedBoard:num(plan.plannedBoardCount),targetBoard:num(plan.targetBoardCount),rareUsed:num(item.rareUsed),rareConflict:num(item.rareConflict||summary.conflict),wispShortage:num(item.wispShortage),futureDependencyCount:num(item.futureDependencyCount),controlOverflow:num(item.controlCapOverflow),materialOverlapPenalty:num(item.materialOverlapPenalty),requirementPriority:[].concat(item.requirementPriority||[]),powerTier:item.powerTier||row.powerTier,safetyBand:num(item.safetyBand),angleBand:num(item.angleBand),angleLabel:String(item.angleLabel||''),tierPromotion:num(item.tierPromotion),effectiveTierRank:num(item.effectiveTierRank),memoPackage:item.memoPackage||null,supports:blueprintSupportRows(model,item),plannedComplete:!!planned.complete},blueprintProposal:item.blueprint||null});
    });
    // 계획된 후보끼리는 전체 파티 비교로, 나머지는 투영 순서 그대로
    // 그 아래에 붙인다.  계획 안 된 후보에는 근거를 남겨 화면이 "왜
    // 파티 평가가 없는지" 설명할 수 있게 한다.
    // 계획하지 않은 후보에는 각 라벨을 지어내지 않는다.  '미평가'로
    // 명시해 화면이 "왜 이 카드엔 파티 평가가 없는지" 설명할 수 있게 한다.
    const skipped=planRest.map(row=>Object.assign({},row,{angleLabel:'미평가',angleBand:0,tierPromotion:0,effectiveTierRank:row.powerTier&&row.powerTier.known?num(row.powerTier.rank):-1,blueprintEvaluation:{basis:'route-projection-only',planned:false,rank:0,powerTier:row.powerTier||{known:false,letter:'',rank:-1},angleLabel:'미평가',angleBand:0,tierPromotion:0,note:`전체 파티 계획은 상위 ${UPPER_BLUEPRINT_PLAN_CAP}개까지만 수행합니다.`}}));
    return decorated.concat(skipped).sort(mixedPlanCompare);
  }catch(error){
    return rows.slice().sort(integratedUpperCompare).map(row=>Object.assign({},row,{blueprintEvaluation:{basis:'route-projection-fallback',error:String(error&&error.message||error)}}));
  }
}
function upperRouteCandidates(model,locks){
  const lock=lockedUpper(locks);if(lock&&!P.resolveRoute(model.intent,model.settings))return lockedMagicRouteRows(model,lock);
  const options=routeOptions(model),byRoute=[],storyRewardSettingKnown=Object.prototype.hasOwnProperty.call(model.settings||{},'story10Reward');
  const gapOf=row=>row.feasible?0:num(row.wispGap);
  const nearestOf=list=>list.reduce((best,row)=>!best||gapOf(row)<gapOf(best)-1e-9||Math.abs(gapOf(row)-gapOf(best))<=1e-9&&clearValueCompare(row,best)<0?row:best,null);
  const gatedAll=new Map();
  // v17.12: 같은 정규화 계보 안에서 게이트 변형(베가펑크(핸콕))이 비게이트
  // 변형(핸콕 영원)을 밀어내면 안 된다 — 지금 만들 수 있는 쪽이 대표다.
  const canonicalCompare=(left,right)=>(left.specialGate?1:0)-(right.specialGate?1:0)||clearValueCompare(left,right);
  for(const route of options){const canonical=new Map();for(const unit of model.knowledge.db.uppers){if(!routeFamilyOk(unit,route))continue;const row=upperRouteRow(model,unit,route);if(!row)continue;row.clearValue=clearValueScore(model,row);if(row.specialGate){const gateKey=C.canonicalUpperId(unit.id);const priorGated=gatedAll.get(gateKey);if(!priorGated||clearValueCompare(row,priorGated)<0)gatedAll.set(gateKey,row);}const key=C.canonicalUpperId(unit.id),prior=canonical.get(key);if(!prior||canonicalCompare(row,prior)<0)canonical.set(key,row);}
    // 숏리스트도 클리어 가치 순으로 뽑는다 — 도달 거리 순 숏리스트는
    // 멀지만 좋은 상위(예: 핸콕 영원)를 투영 전에 잘라버린다.
    // v17.12: 게이트 상위는 정규 카드 자리를 소비하지 않는다 — 별도 칩
    // 목록(gatedUppers)으로만 내려가고, 특수재료를 실제로 얻는 순간
    // 게이트가 풀려 정규 후보로 경쟁한다.
    const ranked=[...canonical.values()].filter(row=>!row.specialGate).sort(clearValueCompare),shortlist=[],shortlistKeys=new Set(),push=row=>{const key=row&&C.canonicalUpperId(row.id);if(!row||shortlistKeys.has(key)||shortlist.length>=UPPER_BLUEPRINT_CAP)return;shortlistKeys.add(key);shortlist.push(row);};
    // Direct combat value is only one anchor.  Preserve candidates that best
    // close the live role vector as well, then let the full final-squad planner
    // decide the order after support, collision and control-overflow checks.
    // S/A/B 대표는 투영 전부터 보존한다. 낮은 티어가 가까운 패라는 이유로
    // 고티어 후보 전체를 잘라내는 현상을 막고, 최종 순서는 9인 조합 비교가
    // 다시 결정한다.
    for(const letter of ['S','A','B'])push(ranked.find(row=>row.powerTier&&row.powerTier.letter===letter));
    // 고수들이 희귀·특별 패만 보고 잡는 "현재 각"을 후보 생성 단계에서
    // 보존한다. 전체 파티 비교 전에 잘리면 뒤의 angleBand 승격은 영원히
    // 실행될 수 없다. 좋은 상위 우선 원칙을 지키기 위해 먼저 티어를 보고,
    // 같은 티어에서는 10선위 이하·보유 희귀 직접 소비를 우선한다.
    currentHandAngleProbes(ranked,2).forEach(push);
    ranked.slice(0,2).forEach(push);
    // A declared/open Story 10 reward route is a real, mutually exclusive
    // strategic option.  Its prerequisite is intentionally absent from the
    // live stock, so the full-squad planner cannot rank it as an ordinary
    // candidate.  Preserve the strongest explicitly-labelled reward route as
    // an assumption card instead of silently dropping it from the shortlist.
    if(storyRewardSettingKnown)push(ranked.filter(row=>row.storyReward).sort(clearValueCompare)[0]);
    upperProjectionShortlist(ranked,route).forEach(push);
    // The nearest craft remains visible as a comparison anchor; it no longer
    // becomes rank 1 merely because it is cheap or has a high standalone DPS.
    const laneNearest=nearestOf(ranked);
    push(laneNearest);
    const rows=applyBlueprintRanking(model,route,shortlist.map(row=>projectUpperRouteRow(model,row,route)));
    for(const row of rows)if(!row.clearValue)row.clearValue=clearValueScore(model,row);
    rows.sort(mixedPlanCompare);byRoute.push({route,rows});}
  const dedupe=list=>{const seenCanonical=new Map();const out=[];for(const row of list){const key=C.canonicalUpperId(row.id);const prior=seenCanonical.get(key);if(prior==null){seenCanonical.set(key,out.length);out.push(row);}else if(canonicalCompare(row,out[prior])<0)out[prior]=row;}return out;};
  const blueprintLanes=byRoute.map(lane=>({
    key:lane.route.key,
    mode:lane.route.mode,
    route:lane.route.key,
    candidateIds:[...new Set((lane.rows||[]).map(row=>String(row&&row.id||'')).filter(Boolean))]
  })).filter(lane=>lane.candidateIds.length);
  // Final order is the integrated Upper+support blueprint.  Standalone clear
  // value is retained only as a late tie-break and explanation datum.
  const pool=dedupe(byRoute.flatMap(lane=>lane.rows).sort(mixedPlanCompare)).sort(mixedPlanCompare);
  const picked=pool.slice(0,ROUTE_CANDIDATE_LIMIT);
  const nearest=nearestOf(pool);
  const storyAnchor=storyRewardSettingKnown?pool.filter(row=>row.storyReward).sort(clearValueCompare)[0]:null,pinned=new Set(),pin=row=>{
    if(!row)return;pinned.add(row);if(picked.includes(row))return;
    if(picked.length<ROUTE_CANDIDATE_LIMIT){picked.push(row);return;}
    for(let index=picked.length-1;index>=0;index--)if(!pinned.has(picked[index])){picked[index]=row;return;}
  };
  if(nearest)nearest.nearestBuild=true;
  pin(nearest);
  pin(storyAnchor);
  picked.sort(mixedPlanCompare).forEach((row,index)=>{
    if(row.blueprintEvaluation&&row.blueprintEvaluation.rank)row.blueprintEvaluation.rank=index+1;
  });
  // 카드 6개와 별개로, 게이트 상위 전체(베가펑크 4종 등 정규화 대표)를
  // 칩 목록으로 내려 보낸다 — UI가 "그린블러드 확보 시 열리는 상위"를
  // 한 줄로 보여줄 수 있게.  게이트 상위는 정규 카드 자리를 차지하지
  // 않는다(위 shortlist 필터) — 재료 확보 시 자동으로 정규 후보가 된다.
  picked.gatedUppers=[...gatedAll.values()].sort(clearValueCompare).slice(0,6).map(row=>({id:row.id,name:row.name,routeKey:row.routeKey,wispCost:num(row.wispCost),completion:num(row.completion),items:row.specialGate.items.map(item=>({id:item.id,name:item.name}))}));
  picked.blueprintLanes=blueprintLanes;
  return picked;
}
function liveRareProtection(model,counts,route,locks,rareId){
  if(num(counts[rareId])<=0)return[];const settings=Object.assign({},model.settings,{magicRoute:route.key,_resolvedMagicRoute:route.key}),before=M.roleState(model,counts,route.mode,settings,locks,false),afterCounts=clone(counts);afterCounts[rareId]=Math.max(0,num(afterCounts[rareId])-1);const after=M.roleState(model,afterCounts,route.mode,settings,locks,false);
  // v17.6(감사 P0-4): 정적 route.groups 키만 비교하면 상위 전략 needs로
  // 동적 추가된 필수 역할(예: 드래곤 단일 2·끝딜 1)이 보호 비교에서
  // 빠져, 그 역할에만 기여하는 희귀가 리롤 후보로 샜다.  필수(waived
  // 제외) 역할 전체를 제거 전/후로 비교한다.
  const afterMap=new Map((after.deficits.requirements||[]).map(row=>[row.key,row])),labels=[];
  for(const left of before.deficits.requirements||[]){
    if(left.required===false||left.waived)continue;
    const right=afterMap.get(left.key);
    if(right&&num(right.gap)>num(left.gap)+1e-9)labels.push(left.label);
  }
  return[...new Set(labels)];
}
function rareDisposition(model,route,locks,searchResult){
  const counts=model.effective.counts,best=searchResult.best,paths=searchResult.paths||[],first=best&&best.sequence[0],useMap=clone(first&&first.quote.rareUse),bestFuture={};for(const step of best&&best.sequence.slice(1)||[])for(const [id,value] of Object.entries(step.quote.rareUse||{}))bestFuture[id]=num(bestFuture[id])+num(value);const pathMaximum={};for(const path of paths){const pathUse={};for(const step of path.sequence||[])for(const [id,value] of Object.entries(step.quote.rareUse||{}))pathUse[id]=num(pathUse[id])+num(value);for(const [id,value] of Object.entries(pathUse))pathMaximum[id]=Math.max(num(pathMaximum[id]),num(value));}const rows=[];
  // v17.6(감사 P0-1): 희귀 리롤은 게임당 총 2회 확정 규칙.  소진하면
  // 리롤 후보 자체를 만들지 않는다 — REROLL_ONE 상태도 자연히 사라진다.
  const rerollBudget=Math.max(0,2-num(model.settings.rerollsUsed));
  for(const unit of model.knowledge.db.rares){const initial=Math.max(0,num(counts[unit.id]));if(initial<=0)continue;let remaining=initial,use=Math.min(remaining,num(useMap[unit.id]));remaining-=use;const liveLabels=liveRareProtection(model,counts,route,locks,unit.id),alternativeNeed=Math.max(0,num(pathMaximum[unit.id])-use),future=Math.max(num(bestFuture[unit.id]),alternativeNeed);let hold=Math.min(remaining,Math.max(future,liveLabels.length?1:0));remaining-=hold;const rerollAllowed=model.round.value>=25&&rerollBudget>0,reroll=rerollAllowed?remaining:0;if(!rerollAllowed){hold+=remaining;remaining=0;}const reason=use?`${first&&nameOf(first.quote.unit)} 즉시 재료`:liveLabels.length?`현재 전투 ${liveLabels.join(' · ')} 보호`:hold?(model.round.value>=25&&rerollBudget<=0?'리롤 2회 모두 사용 — 남은 희귀는 보류':'검토한 모든 현재 패 경로에서 사용'):'검토한 현재 패 경로와 전투 역할에 사용처 없음';rows.push({id:unit.id,name:nameOf(unit),unit,initial,use,hold,reroll,reason,proof:{consideredPaths:paths.length,committedFuture:num(bestFuture[unit.id]),alternativeNeed,liveCombat:liveLabels,exclusive:use+hold+reroll===initial}});}
  const conflict=rows.some(row=>!row.proof.exclusive),safeReroll=conflict?null:rows.filter(row=>row.reroll>0).sort((a,b)=>b.reroll-a.reroll||a.name.localeCompare(b.name,'ko')||String(a.id).localeCompare(String(b.id)))[0]||null;return{basis:'single-authority-with-feasible-path-proof',rows,use:rows.filter(row=>row.use>0),hold:rows.filter(row=>row.hold>0),reroll:rows.filter(row=>row.reroll>0),safeReroll,conflict};
}
function exclusionReason(best,path){if(path.coverage.deadEnds.length>best.coverage.deadEnds.length)return'남은 선택 위습으로 필수 역할을 닫는 경로가 줄어듭니다.';const checkpoint=P.compareVector(path.assessment.checkpointVector,best.assessment.checkpointVector);if(checkpoint>0)return'현재 라운드 마감 결손을 덜 줄입니다.';const full=P.compareVector(path.assessment.fullVector,best.assessment.fullVector);if(full>0)return'전체 필수 역할 결손이 더 많이 남습니다.';if(path.resources.wisp>best.resources.wisp)return`같은 수준의 진행에 선택 위습을 ${path.resources.wisp-best.resources.wisp}개 더 씁니다.`;return'희귀·특별·안흔 패의 전체 경로 활용도가 낮습니다.';}

// The final-squad planner and the live V15 search used to approve different
// crafts from the same hand.  The app then displayed V15's craft but protected
// the squad's Rare cards, creating two mutually exclusive futures.  Reconcile
// at the authority boundary: only the first exact squad-prefix action may
// become ACT_NOW, and it is re-quoted against the V15 current-stock ledger.
function reconcileSquadExecution(decision,squad,locks){
  if(!decision||!decision.model||!squad||squad.error)return decision;
  const model=decision.model,prefix=squad.safePrefix||{},actions=Array.isArray(prefix.actions)?prefix.actions:[],audit=prefix.audit||{},rawAction=decision.action||decision.blockedAction||null,withEvidence=(patch,extra)=>Object.assign({},decision,patch,{evidence:Object.assign({},decision.evidence||{},extra||{})});
  // v17.28(사용자 지적): "이 타이밍에 추천을 안 해버리면 굉장히 곤란하다."
  // 이 가드는 최종 파티와 어긋나는 제작을 '승인'하지 않으려는 것이지
  // 화면을 비우려는 게 아니다.  그런데 action·blockedAction을 둘 다
  // null로 만들어 1번 카드에 아무것도 안 남았다 — 실측 로그
  // ORD_2305_20260728_053445에서 r38~r52 사이 9개 라운드가 이 상태였고
  // r39·r51은 그 라운드 내내 여기서 멈춰 있었다.
  // 승인은 계속 막되(action은 null 유지), 엔진이 원래 만들려던 유닛을
  // blockedAction으로 남겨 무엇을 왜 기다리는지 보이게 한다.
  const blockedFallback=()=>decision&&(decision.action||decision.blockedAction)||null;
  const blocked=(state,reason,extra)=>withEvidence({state,label:state==='SYNC_BLOCKED'?'현재 패 재검증 필요':'최종 파티 제작 순서 보류',reason,action:null,blockedAction:blockedFallback()},{executionAuthority:'squad-prefix-requoted-v15',squadPrefixRejected:true,squadPrefixRejectReason:reason,...extra});
  if(!actions.length){
    if(decision.state==='ACT_NOW')return blocked('HOLD','최종 파티의 현재 패 검증 순서에 없는 제작이라 승인하지 않습니다. 패가 바뀌면 파티와 제작 순서를 함께 다시 계산합니다.',{rawActionId:String(rawAction&&rawAction.id||'')});
    return withEvidence({}, {executionAuthority:'squad-prefix-requoted-v15',squadPrefixEmpty:true});
  }
  if(['stop','hold'].includes(String(audit.level||'')))return blocked('HOLD',`최종 파티 검증이 ${audit.level==='stop'?'필수 역할 회귀':'현재 체크포인트 개선 없음'}으로 판정되어 제작을 잠급니다.`,{squadAuditLevel:String(audit.level||'')});
  const planned=actions[0],plannedId=String(planned&&planned.id||''),unit=model.knowledge&&model.knowledge.db&&model.knowledge.db.byId.get(plannedId);
  if(!plannedId||!unit)return blocked('SYNC_BLOCKED','최종 파티의 첫 제작 유닛을 현재 카탈로그에서 확인하지 못했습니다.',{plannedId});
  const lineupIds=new Set((squad.finalLineup||[]).map(item=>String(item&&item.id||item&&item.unit&&item.unit.id||'')));
  if(lineupIds.size&&!lineupIds.has(plannedId))return blocked('SYNC_BLOCKED','검증된 첫 제작이 최종 파티 목록과 일치하지 않습니다.',{plannedId});
  const quote=L.quote(model,unit,model.effective.counts,{availableRound:model.round.value});
  if(!quote||!quote.feasible||String(quote.targetId||unit.id)!==plannedId)return blocked('SYNC_BLOCKED',`최종 파티 첫 제작 ${nameOf(unit)}을 현재 패 원장으로 다시 견적했지만 완성할 수 없습니다. TMO를 다시 동기화하세요.`,{plannedId,quoteFeasible:!!(quote&&quote.feasible)});
  const route=decision.assessment&&decision.assessment.route||P.resolveRoute(Object.assign({},model.intent,{damageMode:squad.mode||model.intent&&model.intent.damageMode,magicRoute:squad.magicRoute||model.intent&&model.intent.magicRoute}),Object.assign({},model.settings,{mode:squad.mode||model.settings.mode,magicRoute:squad.magicRoute||model.settings.magicRoute}));
  if(!route)return blocked('SYNC_BLOCKED','최종 파티의 물딜·마딜 세부 경로를 확인하지 못했습니다.',{plannedId});
  const activeLocks=Array.isArray(locks)?locks:[],before=P.evaluate(model,model.effective.counts,route,{round:model.round.value,locks:activeLocks}),after=P.evaluate(model,quote.after,route,{round:model.round.value,locks:activeLocks}),afterByKey=new Map((after.requirements||[]).map(row=>[row.key,row])),regressed=(before.requirements||[]).filter(row=>row.required!==false&&!row.waived).filter(row=>{const next=afterByKey.get(row.key);return next&&num(next.gap)>num(row.gap)+.005;}).map(row=>row.label||row.key);
  if(regressed.length)return blocked('HOLD',`최종 파티 첫 제작이 현재 필수 역할을 악화시킵니다: ${regressed.join(' · ')}`,{plannedId,regressedRequired:regressed});
  const deltas=requirementDeltas(before,after),reason=String(planned.reason||'최종 파티의 현재 패 검증 첫 순서'),row=makeRow(model,quote,after,reason),path=actions.map(action=>({id:String(action.id||''),name:String(action.name||''),wispCost:num(action.wispCost)})).filter(action=>action.id),action={id:plannedId,name:nameOf(unit),unit,row,quote,wispCost:num(quote.wisp.cost),wispAfter:num(quote.wisp.after),result:'squad-prefix-requoted',reason,deltas,stopCondition:`${Object.keys(quote.consumed||{}).length?'표시 재료가 하나라도 바뀌거나 ':''}선택 위습이 ${num(quote.wisp.cost)}개 미만이면 만들지 말고 다시 동기화`,path};
  return withEvidence({state:'ACT_NOW',label:'최종 파티 · 지금 제작',reason,action,blockedAction:null,assessment:before,afterAction:after,bestPath:{steps:path,assessment:after,remainingWisp:num(quote.wisp.after),deadEnds:[]},rare:rareLedgerForQuote(model,quote,'ACT_NOW',`최종 파티 ${nameOf(unit)}`),alternatives:[]},{executionAuthority:'squad-prefix-requoted-v15',squadPrefixRejected:false,plannedId,quotedId:String(quote.targetId||unit.id),rawActionId:String(rawAction&&rawAction.id||''),sourceFingerprint:String(model.fingerprint||''),rawActionReplaced:!!rawAction&&String(rawAction.id||'')!==plannedId});
}

// v18 — 침묵 금지.
//
// 첫 클리어 로그(68라운드)를 재생하면 47라운드가 action null이었다.  r16~r32는
// 방향 선택 클릭을 기다리느라 17라운드 연속 무응답이었고, r55~r68은 HOLD
// 상태로 "지금 증명되는 제작은 없습니다"만 14라운드 반복하면서 도달 불가능한
// 목표(류마 · 조로 11장 부족)를 회복 목표로 내놓았다.  게임의 3분의 2에서
// 코치가 아무 말도 하지 않은 셈이다.
//
// 그렇다고 승인 권한을 헐겁게 만들 수는 없다 — action은 "엔진이 증명한
// 제작"이라는 뜻이고 그 의미는 v17.28에서 사용자가 직접 지킨 계약이다.
// 그래서 승인(action)은 그대로 두고, 화면이 항상 읽을 수 있는 별도 필드를
// 만든다: coachAction 은 비지 않는다.  대신 얼마나 확신하는지를 같이 낸다.
//
//   확정 — 엔진이 승인한 제작(action).  지금 눌러도 되는 것.
//   유력 — 계산은 끝났지만 승인 조건을 못 넘긴 것(blockedAction·제안).
//   차선 — 증명된 게 없을 때의 최선.  방향 미확정 1순위, 회복 목표 등.
//   운영 — 만들 게 남지 않은 마감 구간에서 할 일.
const COACH_LEVELS=Object.freeze({approved:'확정',likely:'유력',fallback:'차선',operations:'운영'});
// 마감 국면 진입선.  50라 보스 구조 마감이 지나면 판단의 성격이 바뀐다 —
// 제작 최적화 문제가 아니라 가진 것을 어떻게 쓰느냐의 문제가 된다.
const OPERATIONS_ROUND=51;
// 지목하는 목표에는 감당 가능 여부를 반드시 붙인다.
//
// 침묵을 없애다가 거짓말로 바꾸면 더 나쁘다.  실제로 그럴 뻔했다 —
// 방향 미확정 구간에서 후보의 첫 스텝을 찾지 못하면 상위 유닛 자신으로
// 폴백했는데, 첫 클리어 로그 r16~r23을 재생하면 선위 11을 들고 있는
// 사용자에게 선위 32짜리 상위를 여덟 라운드 연속 "다음 행동"이라고
// 내밀고 있었다.  못 하는 걸 하라고 하는 것은 안내가 아니다.
function coachStep(row,wisp){
  if(!row)return null;
  const cost=num(row.wispCost),have=num(wisp);
  return{id:String(row.id||''),name:String(row.name||row.label||''),wispCost:cost,unit:row.unit||null,
    affordable:cost<=have,wispShort:Math.max(0,cost-have)};
}
function currentWisp(model){return num(model&&model.effective&&model.effective.counts&&model.effective.counts[C.WISP_ID]);}
// 회복 목표 중 "지금 실제로 갈 수 있는 것"을 고른다.  재료가 11장 모자란
// 목표를 14라운드 내내 붙잡고 있으면 안내가 아니라 소음이다.
function reachableRecovery(recovery){
  const targets=(recovery&&recovery.targets||[]).filter(Boolean);
  if(!targets.length)return null;
  const feasible=targets.filter(row=>row.feasible);
  if(feasible.length)return feasible.sort((a,b)=>num(a.wispCost)-num(b.wispCost))[0];
  // 아무것도 못 만들면 가장 가까운 것 하나만 남긴다 — 거리(부족 재료 수 +
  // 위습 부족)를 기준으로 고른다.
  const distance=row=>(row.missing||[]).reduce((total,item)=>total+num(item.count),0)+Math.max(0,num(row.wispGap));
  return targets.slice().sort((a,b)=>distance(a)-distance(b))[0]||null;
}
// v18: 국면을 판단의 1급 필드로 만든다.
//
// 저장소에는 국면 분류가 이미 넷 있었다 — C.gameFlow().phase(9종, v15
// 권위 경로에서 호출되지 않음), C.phaseForRound(라운드 산술, 표시 전용),
// P.checkpointFor(권한은 있으나 late55/60/65가 값이 동일), 그리고
// buildDecision의 관문 순서(실제 권위, 이름 없음).  넷 중 목적함수를
// 가진 것은 하나도 없었고, 그래서 "마감 구간에 할 말이 없다"는 문제가
// 생겼다 — 국면이 없으니 68라운드 내내 같은 목적함수로 말한 것이다.
//
// 진입은 라운드가 아니라 상태로 정한다.  첫 클리어 로그의 r51~r54는
// 51라를 넘겼는데도 제작이 남아 있었다.
function decisionPhase(decision,model,roundNow,confidenceKey){
  const final=M.finalSummary(model,model.effective.counts);
  if(num(final.legendEquivalent)<=0)return{key:'opening',label:'개설',objective:'첫 희귀·첫 전설까지 최단 경로'};
  if(decision.state==='ROUTE_CHOICE')return{key:'direction',label:'방향',objective:'상위 방향 확정 — 후회 없는 제작만 진행'};
  if(confidenceKey==='operations')return{key:'operations',label:'운영',objective:'제작이 아니라 배치·컨트롤·자원 처분'};
  return{key:'build',label:'구축',objective:`생존 축을 ${P.SURVIVAL_DEADLINE_ROUND||50}라 전에 닫는다`};
}
function coachGuidance(decision,model,roundNow){
  const wisp=currentWisp(model);
  const level=(key,step,note)=>({
    coachAction:step,
    confidence:{level:COACH_LEVELS[key],key,note:String(note||'')},
    phase:decisionPhase(decision,model,roundNow,key)
  });
  if(decision.action)return level('approved',coachStep(decision.action,wisp),decision.reason||'');
  if(decision.blockedAction)return level('likely',coachStep(decision.blockedAction,wisp),decision.reason||'승인 조건을 아직 못 넘겼습니다.');
  if(decision.proposed)return level('likely',coachStep(decision.proposed,wisp),decision.reason||'');
  // 방향(상위) 미확정.  기다리지 말고 1순위 후보의 첫 제작을 보여준다.
  // 그 사이 17라운드를 비워 두는 것보다 낫다.
  //
  // 다만 여기서 방향을 대신 골라 주지는 않는다.  첫 클리어 로그의
  // 방향 미확정 구간 16라운드를 재보면 상위 3후보가 지목하는 다음 제작이
  // 16번 다 서로 달랐다.  틀린 쪽 재료를 먼저 먹으면 되돌릴 수 없다.
  // 그래서 후보들이 서로 다른 것을 가리킬 때는 그 사실을 같이 말한다.
  const candidates=(decision.routeCandidates||[]).filter(Boolean);
  const lead=candidates[0];
  if(lead){
    // 후보의 "첫 스텝"은 워커가 전체 파티 계획을 돌려 준 뒤에만 존재한다.
    // 계획 전에는 prefix가 비어 있으므로, 없는 것을 있는 척하지 않는다.
    const firstStep=row=>(row.prefix||[]).find(item=>item&&item.id&&num(item.wispCost)<=wisp)||null;
    const heads=new Set(candidates.slice(0,3).map(row=>{const step=firstStep(row);return String(step?step.id:row.id||'');}));
    const split=heads.size>1;
    const divergence=split
      ?` 상위 후보들이 서로 다른 것을 지목하고 있으니(${heads.size}종), 재료를 쓰기 전에 방향부터 고르는 편이 안전합니다.`
      :' 상위 후보들이 모두 같은 것을 지목하므로 방향과 무관하게 진행해도 됩니다.';
    const affordable=candidates.map(firstStep).find(Boolean);
    if(affordable)return level('fallback',coachStep(affordable,wisp),`방향 미확정 · 지금 선위(${wisp})로 할 수 있는 공통 진행입니다.${divergence}`);
    // 지금 선위로 할 수 있는 게 없으면 제작을 지목하지 않는다.  모으라고
    // 말하는 것이 감당 못 할 목표를 내미는 것보다 정확하다.
    const short=Math.max(0,num(lead.wispCost)-wisp);
    return level('fallback',null,`방향 미확정 · 1순위는 ${lead.name}(선위 ${num(lead.wispCost)})인데 지금 선위가 ${wisp}입니다${short?` — ${short} 더 필요` : ''}. 지금은 선위를 모으는 구간입니다.${divergence}`);
  }
  const alternative=(decision.alternatives||[])[0];
  if(alternative)return level('fallback',coachStep(alternative,wisp),alternative.reason||'승인된 제작은 없지만 이게 가장 낫습니다.');
  const recovery=reachableRecovery(decision.recovery);
  // 마감 국면 진입은 라운드가 아니라 "만들 게 남았는가"로 정한다.  첫
  // 클리어 로그의 r51~r54는 51라를 넘겼는데도 도플라밍고·카쿠를 계속
  // 제작했다 — 라운드로만 끊으면 그 넷을 운영 안내로 덮어버린다.
  // 그래서 지금 만들 수 있는 목표가 있으면 라운드와 무관하게 그것을
  // 먼저 말하고, 마감을 넘긴 뒤 닿지 않는 목표만 운영으로 넘긴다.
  if(recovery&&(recovery.feasible||num(roundNow)<OPERATIONS_ROUND)){
    const missing=(recovery.missing||[]).map(row=>`${row.name} ${row.count}`).join(' · ');
    return level('fallback',coachStep(recovery,wisp),recovery.feasible?`${recovery.roleLabel||'남은 역할'}을 닫는 최근접 목표입니다.`:`${recovery.roleLabel||'남은 역할'} 목표 · 부족: ${missing||`위습 ${Math.max(0,num(recovery.wispGap))}`}`);
  }
  // 마감 구간.  더 만들 게 없으면 만들라는 말을 반복하지 않는다.
  return level('operations',null,operationsNote(decision,recovery,roundNow,model));
}
// 마감 구간 안내.  같은 상태가 이어지면 문장이 반복되는 건 정상이지만,
// 그 문장에 사용자가 실제로 판단에 쓰는 수치는 들어 있어야 한다 —
// 지금 위습이 얼마고, 남은 목표까지 얼마가 모자라고, 모아서 닿기는 하는가.
function operationsNote(decision,recovery,roundNow,model){
  const assessment=decision.assessment||{};
  const axes=assessment.axes||{};
  const wisp=num(model&&model.effective&&model.effective.counts&&model.effective.counts[C.WISP_ID]);
  const head=`${num(roundNow)}라 · 위습 ${wisp}`;
  const survivalOpen=(axes.survival&&axes.survival.open)||[];
  if(survivalOpen.length){
    const row=survivalOpen[0];
    return `${head} · ${row.label} ${row.current}/${row.target} — 생존 역할이 열린 채로 마감 구간입니다. 리롤로라도 이 행부터 닫으세요.`;
  }
  const firepowerOpen=(axes.firepower&&axes.firepower.open)||[];
  const rare=(decision.rare&&decision.rare.safeReroll)||null;
  const gap=recovery?Math.max(0,num(recovery.wispGap)):0;
  // 모아서 닿는 목표가 남아 있는지를 분명히 말한다.  닿지 않는 목표를
  // 붙잡고 위습을 아끼는 것이 이 구간의 가장 흔한 손해다.
  const reach=recovery
    ?(recovery.feasible?`${recovery.name}은 지금 만들 수 있습니다.`
      :gap>0?`가장 가까운 ${recovery.name}까지 위습 ${gap} 부족${(recovery.missing||[]).length?` · 재료도 ${(recovery.missing||[]).map(row=>`${row.name} ${row.count}`).join('·')} 부족`:''}.`
      :`가장 가까운 ${recovery.name}은 재료가 ${(recovery.missing||[]).map(row=>`${row.name} ${row.count}`).join('·')||'부족'}합니다.`)
    :'남은 제작 목표가 없습니다.';
  if(rare)return `${head} · ${reach} ${rare.name} 리롤로 남은 화력을 노려볼 수 있습니다.`;
  if(firepowerOpen.length){
    const row=firepowerOpen[0];
    return `${head} · 생존 구조는 닫혔고 ${row.label} ${row.current}/${row.target}만 남았습니다. ${reach} 안 닿으면 배치와 끝딜 컨트롤로 메우세요.`;
  }
  return `${head} · 필수 구조는 정리됐습니다. ${reach} 남은 라운드는 배치와 컨트롤 문제입니다.`;
}
function buildDecision(input){
  if(!C||!M||!L||!P)throw new Error('ORDV15Engine requires ORDCore, model, ledger, and policy modules.');
  input=input||{};const model=input.model||M.build(input),locks=input.locks||[],roundNow=model.round.value,final=M.finalSummary(model,model.effective.counts),rareTotal=model.knowledge.db.rares.reduce((total,unit)=>total+Math.max(0,num(model.effective.counts[unit.id])),0),finalize=decision=>Object.assign(decision,{version:VERSION,authority:true,authorityEngine:AUTHORITY,inputFingerprint:model.fingerprint,model},coachGuidance(decision,model,roundNow));
  // Milestones are inventory states, not date windows. Missing the nominal
  // deadline must not silently advance the user into upper planning.
  if(rareTotal<=0&&final.legendEquivalent<=0)return finalize(completionDecision(model,model.knowledge.db.rares.filter(unit=>intentFamilyOk(model,unit)),COMPLETION_MILESTONES.firstRare));
  if(final.legendEquivalent<=0){const candidates=model.knowledge.db.legendish.filter(unit=>!C.isUpper(unit)&&/전설|히든/.test(C.groupName(unit))&&!C.isShip(unit)&&intentFamilyOk(model,unit));return finalize(completionDecision(model,candidates,COMPLETION_MILESTONES.firstFinal));}
  const route=P.resolveRoute(model.intent,model.settings),lock=lockedUpper(locks),postLegend=String(model.settings.postLegendRoute||'');
  // The user explicitly chose "another legend/hidden" after the first one.
  // Keep the same completion authority until they switch to upper preparation.
  if(postLegend==='legend'&&final.nonUpperFinalCount>0&&final.upperCount<=0&&!lock){const candidates=model.knowledge.db.legendish.filter(unit=>!C.isUpper(unit)&&/전설|히든/.test(C.groupName(unit))&&!C.isShip(unit)&&intentFamilyOk(model,unit));return finalize(completionDecision(model,candidates,COMPLETION_MILESTONES.additionalFinal));}
  if(!route||!lock&&final.upperCount<=0){const routeCandidates=upperRouteCandidates(model,locks),routeCandidateLanes=routeCandidates.blueprintLanes||[],lockedDetail=!!lock&&!route,leadRoute=route||routeOptions(model)[0],leadAssessment=P.evaluate(model,model.effective.counts,leadRoute,{round:roundNow,locks});return finalize({state:'ROUTE_CHOICE',label:lockedDetail?'고정 상위의 마딜 세부 경로 선택':'상위 방향 선택',reason:lockedDetail?'감지된 메인 상위는 바꾸지 않고 dual·singleEnd 중 역할표만 선택합니다.':'상위 단독 화력으로 줄 세우지 않습니다. 현재 패로 만든 상위와 이를 보조할 전설급을 9환산 최소 파티로 함께 최적화하고, 재료 충돌·역할 결손·제어 과잉을 반영해 최대 6개만 비교합니다.',action:null,assessment:P.evaluate(model,model.effective.counts,route,{round:roundNow,locks}),routeCandidates,routeCandidateLanes,routeChoiceKind:lockedDetail?'locked-magic-detail':'upper',recovery:recoveryPlan(model,leadRoute,locks,leadAssessment,{note:`방향 확정 전 참고 · ${leadRoute.label} 기준 결손 목표`}),alternatives:[],rare:{basis:'route-uncommitted',rows:model.knowledge.db.rares.filter(unit=>num(model.effective.counts[unit.id])>0).map(unit=>({id:unit.id,name:nameOf(unit),unit,initial:num(model.effective.counts[unit.id]),use:0,hold:num(model.effective.counts[unit.id]),reroll:0,reason:'경로 확정 전 안전 보류'})),use:[],hold:[],reroll:[],safeReroll:null,conflict:false},unknowns:['50~65라 실제 보스 DPS','라인 처리력'],evidence:{observed:M.observedEvidence(model),ledger:'exact-current-stock',rankingAuthority:S&&typeof S.rankUpperBlueprints==='function'?'upper-plus-support-full-squad':'projected-route-fallback',candidateLimit:ROUTE_CANDIDATE_LIMIT,futureDropsCredited:false,fixedFinalParty:false,clearClaim:false}});}
  // A selected but not-yet-observed upper is a hard milestone reservation.
  // Do not let a tempting support legend spend its rares or finite wisps first.
  // v16.6: but the reservation must not freeze the whole board.  A recorded
  // loss sat in full 재료 보호 for 21 rounds (wisp 7~20 vs a 54~78 quote)
  // while 이감/광보잡 starved into the round-60 boss.  While the locked upper
  // is far from affordable, only its own tree materials stay locked: the
  // search runs on the remaining stock so survival deficits keep closing
  // while wisp income accumulates.  The full hold now applies only inside
  // the near-completion band.
  let searchModel=model,upperReserve=null,upperFallback=null;
  if(route&&lock){const lockKey=C.canonicalUpperId(lock.id),owned=model.knowledge.db.uppers.some(unit=>num(model.effective.counts[unit.id])>0&&C.canonicalUpperId(unit.id)===lockKey);if(!owned){const committed=committedUpperDecision(model,route,locks,lock);if(committed){
    const committedQuote=committed.blockedAction&&committed.blockedAction.quote||null,wispShort=committedQuote?Math.max(0,num(committedQuote.wisp.cost)-num(committedQuote.wisp.before)):0,nearlyAffordable=committedQuote?wispShort<=Math.max(UPPER_HOLD_WISP_BAND,num(committedQuote.wisp.cost)*UPPER_HOLD_WISP_RATIO):false;
    if(committed.state==='ACT_NOW'||nearlyAffordable)return finalize(committed);
    const reservedCounts=Object.assign({},model.effective.counts);let reservedUnits=0;
    for(const [id,qty] of Object.entries(committedQuote&&committedQuote.consumed||{})){if(id===C.WISP_ID)continue;const take=Math.min(num(reservedCounts[id]),num(qty));if(take>0){reservedCounts[id]=num(reservedCounts[id])-take;reservedUnits+=take;}}
    searchModel=Object.assign({},model,{effective:Object.assign({},model.effective,{counts:reservedCounts})});
    upperFallback=committed;
    upperReserve={id:committed.blockedAction.id,name:committed.blockedAction.name,reservedUnits,wispCost:num(committedQuote.wisp.cost),wispBefore:num(committedQuote.wisp.before),wispShort,holdBand:Math.max(UPPER_HOLD_WISP_BAND,round(num(committedQuote.wisp.cost)*UPPER_HOLD_WISP_RATIO,1)),storyRewardNeeded:(committedQuote.blocked||[]).some(text=>/레일리|해적선/.test(String(text)))&&story10RewardOpen(model)};
  }}}
  const searched=search(searchModel,route,locks),best=searched.best;
  if(!best){const rare=rareDisposition(searchModel,route,locks,searched),recovery=recoveryPlan(searchModel,route,locks,searched.initialAssessment);
    // With an upper reservation active, an empty search keeps the familiar
    // 재료 보호 authority instead of a generic hold, enriched with the
    // recovery targets computed on the reserved stock.
    if(upperFallback&&!rare.safeReroll)return finalize(Object.assign(upperFallback,{recovery,upperReserve}));
    return finalize({state:rare.safeReroll?'REROLL_ONE':'HOLD',label:rare.safeReroll?'희귀 1장 리롤 후 재계산':'현재 패 소비 보류',reason:rare.safeReroll?`${rare.safeReroll.name}은 검토한 현재 패 경로와 현재 전투 역할에 사용처가 없습니다.`:recovery?'지금 증명되는 제작은 없습니다. 아래 회복 목표의 재료를 모으거나 리롤로 찾으세요.':'현재 패로 다음 필수 조건을 안전하게 개선하는 제작을 증명하지 못했습니다.',action:null,assessment:searched.initialAssessment,rare,recovery,upperReserve,alternatives:[],unknowns:searched.initialAssessment.unknowns,search:{candidateCount:searched.basePool.length,pathCount:0,horizon:HORIZON}});}
  const first=best.sequence[0],firstAssessment=P.evaluate(searchModel,first.quote.after,route,{round:roundNow,locks}),deltas=requirementDeltas(searched.initialAssessment,firstAssessment),improves=P.improved(searched.initialAssessment,firstAssessment),pathLoss=best.coverage.deadEnds.length>searched.initialCoverage.deadEnds.length,budgetProtected=!!(searched.budgetGuard&&searched.budgetGuard.applied&&searched.budgetGuard.criticalIds.includes(first.quote.targetId)),freeRepair=freeNonRegressiveRepair(first.quote,searched.initialAssessment,firstAssessment),openRequiredKeys=new Set((searched.initialAssessment.requirements||[]).filter(row=>row.required!==false&&!row.waived&&num(row.gap)>0).map(row=>row.key)),requiredRepair=deltas.some(row=>openRequiredKeys.has(row.key)&&(row.closed||row.gapGain>0)),
  // v16.5: when every remaining open requirement is a coverage dead end (no
  // affordable closer exists in the current hand), a feasible non-regressive
  // craft that still raises the board — more legend equivalent or a surplus
  // past an already-met target (e.g. 변화 도플라밍고 pushing 단·끝 3→3.5) —
  // must not be held.  The recorded run kept exactly such a squeeze in 보류
  // for three rounds.
  deadEndIndexes=new Set((searched.initialCoverage.deadEnds||[]).map(item=>item.index)),openGroupsClosable=(searched.initialAssessment.groups||[]).filter(group=>group.rows.some(row=>row.required!==false&&!row.waived&&num(row.gap)>0)).some(group=>!deadEndIndexes.has(group.index)),noHarm=deltas.every(row=>num(row.gapGain)>=0),equivalentGain=num(firstAssessment.actual&&firstAssessment.actual.legendEquivalent)-num(searched.initialAssessment.actual&&searched.initialAssessment.actual.legendEquivalent),beforeStructure=new Map((searched.initialAssessment.structureRows||[]).map(row=>[row.key,row])),structureGain=(firstAssessment.structureRows||[]).some(row=>{const prior=beforeStructure.get(row.key);return prior&&num(prior.gap)>num(row.gap)+1e-9;}),combatBefore=boardCombatScore(searchModel,searchModel.effective.counts,route),combatAfter=boardCombatScore(searchModel,first.quote.after,route),combatGain=round(combatAfter-combatBefore),meaningfulProgress=requiredRepair||structureGain||deltas.some(row=>num(row.gapGain)>0),surplusUpgrade=first.quote.feasible&&best.regression===0&&openRequiredKeys.size>0&&!openGroupsClosable&&noHarm&&(structureGain||deltas.some(row=>num(row.delta)>0)||combatGain>0),
  // v17.6(감사 P0-5): 필수 역할표가 전부 닫힌 뒤에도 보스 화력이 실제로
  // 충분하다는 증거는 없다(킬 판정 금지 정책).  50라 보스 창부터는 어떤
  // 필수 역할도 깎지 않으면서 보스 화력 축(단일·끝딜·환산·1.5스턴)을
  // 올리는 제작을 HOLD하지 않는다 — 55라 도플 2연속 사망의 잔여 구멍.
  // 이 분기만은 잉여 희귀 경제선(rareExcess) 회귀를 무시한다: 4/6/9
  // 환산은 사용자 정의상 '경제 경고선'이지 보스전 화력 거부 사유가
  // 아니다.  안전선은 noHarm — 어떤 필수 역할의 결손도 다시 열리지
  // 않아야 한다(충족 초과분 안에서의 소모는 허용).
  firepowerUpgrade=first.quote.feasible&&openRequiredKeys.size===0&&roundNow>=50&&noHarm&&equivalentGain>=0&&combatGain>0,
  commit=first.quote.feasible&&(best.regression===0&&(improves&&meaningfulProgress&&(!pathLoss||budgetProtected||freeRepair||requiredRepair)||surplusUpgrade)||firepowerUpgrade),reasonParts=deltas.filter(row=>row.gapGain>0).slice(0,3).map(row=>row.closed?`${row.label} 충족`:`${row.label} ${round(row.before)}→${round(row.after)}`),result=firstAssessment.structuralPass?'structural-only':'progress-only',guardReason=budgetProtected?`${searched.budgetGuard.reason} `:freeRepair&&pathLoss?'선택 위습을 쓰지 않고 필수 역할을 회귀 없이 보강합니다. ':'',reason=reasonParts.length?`${guardReason}${reasonParts.join(' · ')}. ${best.reserve.remaining}선위를 남겨 후속 필수 역할 경로를 보호합니다.`:firepowerUpgrade&&!improves&&!surplusUpgrade?`필수 역할은 모두 충족 — 검증된 전투 기여 점수 ${round(combatBefore,1)}→${round(combatAfter,1)}를 회귀 없이 올립니다. 실제 보스 DPS는 자동 측정하지 않으므로 화력 충분 판정은 하지 않습니다.`:surplusUpgrade&&!improves?`남은 필수 결손은 현재 패로 닫을 수 없습니다. 회귀 없이 스펙을 더 올리는 제작에 여유 자원을 씁니다.`:`${guardReason}현재 마감과 전체 필수 조건을 동시에 개선하는 현재 패 경로입니다.`,row=makeRow(searchModel,first.quote,firstAssessment,reason),action={id:first.quote.targetId,name:nameOf(first.quote.unit),unit:first.quote.unit,row,quote:first.quote,wispCost:first.quote.wisp.cost,wispAfter:first.quote.wisp.after,result,reason,deltas,stopCondition:`${Object.keys(first.quote.consumed||{}).length?'표시 재료가 하나라도 바뀌거나 ':''}선택 위습이 ${first.quote.wisp.cost}개 미만이면 만들지 말고 다시 동기화`,path:first.quote.targetId?best.sequence.map(step=>({id:step.quote.targetId,name:nameOf(step.quote.unit),wispCost:step.quote.wisp.cost})):[]},rare=rareDisposition(searchModel,route,locks,searched),alternatives=searched.paths.slice(1,3).map(path=>{const step=path.sequence[0];return{id:step.quote.targetId,name:nameOf(step.quote.unit),wispCost:step.quote.wisp.cost,reason:exclusionReason(best,path),residual:path.assessment.blockers.slice(0,3)};}),state=commit?'ACT_NOW':rare.safeReroll?'REROLL_ONE':'HOLD',compactGuard=searched.budgetGuard?{applied:!!searched.budgetGuard.applied,reason:searched.budgetGuard.reason||'',criticalIds:(searched.budgetGuard.criticalIds||[]).slice(),filteredIds:(searched.budgetGuard.filteredIds||[]).slice()}:null;
  return finalize({state,label:state==='ACT_NOW'?'지금 제작':state==='REROLL_ONE'?'희귀 1장 리롤 후 재계산':'현재 패 소비 보류',reason:state==='ACT_NOW'?reason:state==='REROLL_ONE'?`${rare.safeReroll.name} 1장만 리롤하고 즉시 다시 읽으세요.`:'후속 필수 역할 경로를 보존하는 확정 제작을 찾지 못했습니다.',action:state==='ACT_NOW'?action:null,blockedAction:state==='ACT_NOW'?null:action,assessment:searched.initialAssessment,afterAction:firstAssessment,bestPath:{steps:action.path,assessment:best.assessment,remainingWisp:best.reserve.remaining,deadEnds:best.coverage.deadEnds},rare,recovery:state==='ACT_NOW'?null:recoveryPlan(searchModel,route,locks,searched.initialAssessment),upperReserve,alternatives,unknowns:searched.initialAssessment.unknowns,search:{candidateCount:searched.basePool.length,unfilteredCandidateCount:searched.rawPool.length,pathCount:searched.paths.length,horizon:HORIZON,beamWidth:BEAM_WIDTH,budgetGuard:compactGuard},evidence:{observed:M.observedEvidence(model),ledger:'exact-sequential',futureDropsCredited:false,clearClaim:false,freeNonRegressiveRepair:freeRepair}});
}

return{VERSION,AUTHORITY,COACH_LEVELS,OPERATIONS_ROUND,decide:buildDecision,reconcileSquadExecution,metaPairs:metaPairEvidence,_test:{coachGuidance,reachableRecovery,operationsNote,decisionPhase,injectedBlueprintRankings,blueprintPlanTargets,applyBlueprintRanking,reconcileSquadExecution,allCandidates,combatPowerScore,boardCombatScore,combatRareCandidates,actionUniverse,recoveryPlan,intentFamilyOk,familyIntent,potentialScore,candidatePool,protectCriticalBudget,futureCoverage,nodeRank,compareNodes,search,rareDisposition,liveRareProtection,completionDecision,requirementDeltas,freeNonRegressiveRepair,resourceTotals,makeRow,upperAllowed,recipeProfile,pairMaterialOverlap,introducesLineageConflict,upperRouteCandidates,upperRouteRow,routeCandidateCompare,clearValueScore,clearValueCompare,routeOptions,expand,metaEvidence}};
});
