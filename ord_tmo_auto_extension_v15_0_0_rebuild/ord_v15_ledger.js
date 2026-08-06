(function(root,factory){
'use strict';
const api=factory(root&&root.ORDCore,root&&root.ORDV15Model);
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.ORDV15Ledger=api;
})(typeof window!=='undefined'?window:globalThis,function(C,M){
'use strict';

const VERSION='20.1.2';
const TIERS=['rare','special','uncommon','common'];
function num(value){return C&&C.num?C.num(value):(Number(value)||0);}
function clone(value){return Object.assign({},value||{});}
function sum(map){return Object.values(map||{}).reduce((total,value)=>total+num(value),0);}
function cloneCounts(value){const out={};for(const [id,count] of Object.entries(value||{}))out[id]=Math.max(0,Math.floor(num(count)));return out;}
function countsKey(counts){return Object.entries(counts||{}).filter(([,value])=>num(value)!==0).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).map(([id,value])=>`${id}:${num(value)}`).join('|');}
function tierUse(db,solve){const byTier=Object.fromEntries(TIERS.map(tier=>[tier,{}])),totals=Object.fromEntries(TIERS.map(tier=>[tier,0]));for(const [id,value] of Object.entries(solve&&solve.consumed||{})){const tier=C.tierKey(db.byId.get(id));if(!byTier[tier]||num(value)<=0)continue;byTier[tier][id]=num(value);totals[tier]+=num(value);}return{byTier,totals};}
function exemptHardIds(solve,prerequisite){
  if(!prerequisite||prerequisite.exception!==true)return new Set();
  const required=new Set((prerequisite.missing||[]).map(row=>String(row.id))),hard=solve&&solve.missingByTier&&solve.missingByTier.hard||{};
  return new Set(Object.keys(hard).filter(id=>num(hard[id])>0&&!required.has(String(id))));
}
function missingRows(solve,prerequisite){
  const rows=[],missing=solve&&solve.missingByTier||{},exempt=exemptHardIds(solve,prerequisite);
  // Missing Commons are the only leaf shortage that selection wisps may fund.
  // Every other missing leaf is an unproved future drop and blocks an exact
  // current-stock quote. This includes malformed/leaf Rare recipes.
  for(const tier of ['uncommon','special','rare','upper','legend','hard','other'])for(const [id,value] of Object.entries(missing[tier]||{}))if(num(value)>0&&!(tier==='hard'&&exempt.has(String(id))))rows.push({id,tier,count:num(value)});
  return rows;
}
function missingUnbuildable(solve,prerequisite){return missingRows(solve,prerequisite).reduce((total,row)=>total+row.count,0);}
function usageCount(db,counts,predicate){let total=0;for(const unit of db.units)if(predicate(unit))total+=Math.max(0,num(counts[unit.id]));return total;}
function ruleBlocks(model,unit,counts,options,solve,prerequisite){
  const db=model.knowledge.db,settings=model.settings||{},round=Math.max(1,num(options&&options.availableRound||model.round.value)),reasons=[];
  if(!unit)reasons.push('유닛 정보 없음');
  if(unit&&num(counts[unit.id])>0)reasons.push('이미 보유');
  if(unit&&C.isUpper(unit)&&db.uppers.some(other=>num(counts[other.id])>0&&C.canonicalUpperId(other.id)===C.canonicalUpperId(unit.id)))reasons.push('같은 상위 경로 이미 보유');
  // v19.9.9(외부 점검 P0-3): 게임 규칙상 상위는 2기까지다.  서로 다른
  // 상위 2기를 이미 보유했으면 새 경로의 세 번째 상위는 원장 불변식으로
  // 차단한다 — 플래너 경로 제한과 별개로, 수동 저격·낡은 lock·UI 오작동이
  // 겹쳐도 quote 가 feasible 을 내지 못하게 원장 자체가 막는다.  기존
  // 계보의 강화·변형은 위 canonical 검사(같은 경로)가 이미 다룬다.
  if(unit&&C.isUpper(unit)){const ownedCanonical=new Set(db.uppers.filter(other=>num(counts[other.id])>0).map(other=>C.canonicalUpperId(other.id)));if(ownedCanonical.size>=2&&!ownedCanonical.has(C.canonicalUpperId(unit.id)))reasons.push('서로 다른 상위 2기 보유 — 세 번째 상위 불가');}
  if(unit&&C.isChanged(unit)&&round<50)reasons.push('변화됨은 50라부터');
  // v17.25: 해적선 완성체는 라운드로 잠그지 않는다. 실제 해적선 재료가
  // 있어야 prerequisite가 열리므로, 상위 확정 뒤 현재 패에서 0선위로
  // 닫히는 방주맥심 같은 좋은 보강을 50라까지 숨길 이유가 없다.
  if(unit&&C.isTranscend(unit)&&settings.superKumaOwned===false)reasons.push('이번 판 초월 불가');
  if(unit&&C.isChanged(unit)&&Math.max(usageCount(db,counts,C.isChanged),num(settings.changedUsed))>=2)reasons.push('변화됨 2회 소진');
  if(unit&&C.isSeraph(unit)&&(usageCount(db,counts,C.isSeraph)>0||num(settings.seraphUsed)>0))reasons.push('세라핌 1회 소진');
  if(unit&&C.isTranscend(unit)&&(usageCount(db,counts,C.isTranscend)>0||num(settings.transcendUsed)>0))reasons.push('초월 1회 소진');
  for(const missing of prerequisite&&prerequisite.missing||[])reasons.push(`${missing.name} 필요`);
  const prerequisiteIds=new Set((prerequisite&&prerequisite.missing||[]).map(row=>String(row.id)));
  for(const row of missingRows(solve,prerequisite))if(!prerequisiteIds.has(String(row.id)))reasons.push(`${C.materialName(db,row.id)} 조합 근거 부족`);
  if(solve&&Array.isArray(solve.cycles)&&solve.cycles.length)reasons.push('레시피 순환 오류');
  return[...new Set(reasons)];
}
function quote(model,target,counts,options){
  if(!C||!M||typeof C.recipeSolve!=='function')throw new Error('ORDV15Ledger requires ORDCore and ORDV15Model.');
  const db=model.knowledge.db,unit=typeof target==='string'?db.byId.get(target):target,stock=cloneCounts(counts||model.effective.counts),availableWisp=num(stock[C.WISP_ID]),solve=unit?C.recipeSolve(db,unit.id,stock):{wispCost:Infinity,consumed:{},stockAfter:stock,missingByTier:{hard:{},other:{}},hardMissing:[],cycles:[]},prerequisite=unit?C.specialPrerequisiteStatus(db,unit,stock):{allowed:false,missing:[]},blocked=ruleBlocks(model,unit,stock,options,solve,prerequisite),tiers=tierUse(db,solve),after=cloneCounts(solve.stockAfter),wispCost=unit?num(solve.wispCost):Infinity;
  if(unit)after[unit.id]=num(after[unit.id])+1;after[C.WISP_ID]=Math.max(0,availableWisp-wispCost);
  const feasible=!!unit&&!blocked.length&&wispCost<=availableWisp&&missingUnbuildable(solve,prerequisite)<=0,negative=Object.entries(after).filter(([,value])=>num(value)<-1e-9).map(([id])=>id);
  return{version:VERSION,targetId:unit&&unit.id||String(target||''),unit,sourceKey:countsKey(stock),availableRound:Math.max(1,num(options&&options.availableRound||model.round.value)),before:stock,after,solve,prerequisite,blocked,feasible:feasible&&!negative.length,wisp:{before:availableWisp,cost:wispCost,after:Math.max(0,availableWisp-wispCost)},tiers,consumed:clone(solve.consumed),rareUse:clone(solve.rareUse),specialUse:clone(solve.specialUse),negative,evidence:{recipe:'exact-recursive-ledger',prerequisites:prerequisite.allowed?'observed-or-patched':'missing',futureDropsCredited:false}};
}
function apply(model,entry,counts){
  const current=clone(counts||entry.before);if(entry.sourceKey!==countsKey(current))return{ok:false,error:'원장 기준 패가 변경됨',counts:current};if(!entry.feasible)return{ok:false,error:entry.blocked[0]||'선택 위습 부족',counts:current};const next=clone(entry.after),negative=Object.entries(next).filter(([,value])=>num(value)<-1e-9);if(negative.length)return{ok:false,error:`음수 재고 ${negative[0][0]}`,counts:current};return{ok:true,counts:next,wisp:num(next[C.WISP_ID]),quote:entry};
}
function reserve(model,targetIds,counts,options){
  let stock=clone(counts||model.effective.counts);const quotes=[],used={};
  for(const id of targetIds||[]){const entry=quote(model,id,stock,options);quotes.push(entry);if(!entry.feasible)return{ok:false,counts:stock,quotes,blockedAt:id,error:entry.blocked[0]||`선택 위습 ${Math.max(0,entry.wisp.cost-entry.wisp.before)}개 부족`,used};for(const [materialId,value] of Object.entries(entry.consumed))used[materialId]=num(used[materialId])+num(value);const applied=apply(model,entry,stock);if(!applied.ok)return{ok:false,counts:stock,quotes,error:applied.error,used};stock=applied.counts;}
  return{ok:true,counts:stock,wisp:num(stock[C.WISP_ID]),quotes,used};
}
function verifyExclusive(quotes,initialCounts){
  let stock=clone(initialCounts),ok=true,error='';for(const entry of quotes||[]){if(entry.sourceKey!==countsKey(stock)){ok=false;error='순차 원장 불일치';break;}const applied=apply(null,entry,stock);if(!applied.ok){ok=false;error=applied.error;break;}stock=applied.counts;}return{ok,error,counts:stock};
}

return{VERSION,TIERS,quote,apply,reserve,verifyExclusive,tierUse,missingUnbuildable,countsKey,_test:{ruleBlocks,usageCount,sum,missingRows,exemptHardIds,cloneCounts}};
});
