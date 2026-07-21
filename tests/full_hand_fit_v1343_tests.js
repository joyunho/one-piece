'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore,units=global.ORD_TMO_UNITS,db=C.buildDb(units),TIERS=['rare','special','uncommon','common'];

function stockedCounts(){
  const counts={[C.WISP_ID]:36,V20h:1};
  for(const unit of units){if(C.isCommon(unit))counts[unit.id]=14;else if(C.isUncommon(unit))counts[unit.id]=7;else if(C.isSpecialTier(unit))counts[unit.id]=4;}
  for(const id of Object.keys(C.SPECIAL_IDS))counts[id]=4;
  for(const unit of db.rares.slice(0,8))counts[unit.id]=C.num(counts[unit.id])+1;
  return counts;
}
function stateFromCounts(counts){return C.normalizeState(units,{counts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});}
function settings(){return{mode:'physical',currentRound:25,targetSquadCount:9,superKumaOwned:true,recommendWarped:true};}
function rank(counts){return P.rankUpperBlueprints({state:stateFromCounts(counts),settings:settings()},{candidateIds:['490H','XB0H']});}
function replaySafePrefix(state,prefix){
  assert(prefix&&prefix.basis==='current-tmo-stock-only','safePrefix must be based on the current TMO stock');
  let stock=Object.assign({},state.counts),wisp=C.num(stock[C.WISP_ID]);
  for(const action of prefix.actions||[]){
    const prerequisite=P._test.prerequisiteStatus(state,state.db.byId.get(action.id),stock),solve=C.recipeSolve(state.db,action.id,stock);
    assert.strictEqual(prerequisite.allowed,true,`${action.name} prerequisite was not owned`);
    assert.deepStrictEqual(solve.hardMissing,[],`${action.name} requires an unowned hard material`);
    assert.deepStrictEqual(solve.missing,{},`${action.name} is not reproducible from the sequential stock`);
    assert(solve.wispCost<=wisp,`${action.name} exceeds the remaining selection-wisp budget`);
    assert.deepStrictEqual(action.spend,solve.consumed,`${action.name} spend ledger differs from a fresh solve`);
    wisp-=solve.wispCost;
    stock=Object.assign({},solve.stockAfter,{[C.WISP_ID]:wisp});
    stock[action.id]=C.num(stock[action.id])+1;
    assert.strictEqual(action.remainingWisp,wisp);
  }
  for(const id of new Set(Object.keys(stock).concat(Object.keys(prefix.afterStock||{}))))assert.strictEqual(C.num(stock[id]),C.num(prefix.afterStock&&prefix.afterStock[id]),`safePrefix afterStock mismatch: ${id}`);
}

const tests=[];function test(name,fn){tests.push([name,fn]);}

test('handFit exposes actual sequential spending for all four hand tiers',()=>{
  const state=stateFromCounts(stockedCounts()),result=P.planFinalSquad({state,settings:settings()});
  assert.strictEqual(result.complete,true);assert.strictEqual(result.handFit.basis,'spent-and-reserved-final-lineup');
  const expected={rare:0,special:0,uncommon:0,common:0};
  for(const action of result.actions)for(const [id,value] of Object.entries(action.solve.consumed||{})){const tier=C.tierKey(state.db.byId.get(id));if(Object.prototype.hasOwnProperty.call(expected,tier))expected[tier]+=C.num(value);}
  for(const tier of TIERS){const block=result.handFit.tiers[tier];assert(block&&block.summary&&Array.isArray(block.rows)&&Array.isArray(block.usedBy),tier);assert.strictEqual(block.summary.spent,expected[tier],`${tier} did not match sequential action consumption`);assert.strictEqual(block.summary.used,block.summary.spent);assert.strictEqual(block.summary.initial,block.summary.spent+block.summary.reserved+block.summary.remaining,`${tier} allocation did not balance`);}
  assert.strictEqual(result.handFit.actualMetrics.wispSubstitute,result.resourceUse.wisp);assert.strictEqual(result.handFit.wisp.used,result.resourceUse.wisp);assert.strictEqual(result.handFit.metrics.wispSubstitute,result.handFit.wisp.required);
  assert.strictEqual(result.routeEvaluation.combatVerified,false,'a role sheet must not claim measured boss damage');
  replaySafePrefix(state,result.safePrefix);
});

test('zero-wisp hand never promotes speculative ordinary drops to a buildable nine-unit party',()=>{
  const counts={[C.WISP_ID]:0};for(const tier of TIERS){let added=0;for(const unit of units)if(C.tierKey(unit)===tier&&added++<8)counts[unit.id]=1;}
  const state=stateFromCounts(counts),result=P.planFinalSquad({state,settings:Object.assign(settings(),{recommendWarped:false})});assert.strictEqual(result.projectedCount,0);assert(result.plannedCount<result.targetCount);assert(result.plannedBoardCount<result.targetBoardCount);assert.strictEqual(result.wispBudget.available,0);assert.strictEqual(result.wispBudget.fullPartyFeasible,false);assert.strictEqual(result.wispBudget.evidence,'future-random-drops-not-funded');assert.strictEqual(result.routeEvaluation.combatVerified,false);assert((result.safePrefix.actions||[]).length<=2);replaySafePrefix(state,result.safePrefix);
  for(const tier of TIERS){const block=result.handFit.tiers[tier];assert.strictEqual(block.summary.conflict,0,`${tier} double-reserved a current card`);assert.strictEqual(block.summary.initial,block.summary.spent+block.summary.reserved+block.summary.remaining);for(const row of block.rows)assert(row.spent+row.reserved<=row.initial-row.protected,`${tier}/${row.name} was allocated twice`);}
});

test('protected common cards remain visible in the user-owned hand',()=>{
  const counts=stockedCounts(),state=stateFromCounts(counts),result=P.planFinalSquad({state,settings:settings(),commonReserve:{우솝:2}}),row=result.handFit.tiers.common.rows.find(item=>item.id==='700h');
  assert(row);assert.strictEqual(row.initial,counts['700h']);assert.strictEqual(row.protected,2);assert(row.spent+row.reserved<=row.initial-row.protected);assert(row.remaining>=row.protected);
});

test('lower-tier hand fit changes order only after clear and wisp cost are equal',()=>{
  const row=(id,lower)=>({upperId:id,upperName:id,clearComplete:true,projectedCount:9,readiness:100,requirementPriority:[0,0,0,0],lineagePairs:0,rareUsed:7,rareClearedTypes:3,rareUsedTypes:3,controlCapOverflow:0,handFitMetrics:{wispSubstitute:0,rareScore:100,lowerScore:lower,weightedClearedTypes:0,weightedUsedTypes:0,commonSubstituted:0,commonPressure:0,weightedSpent:0},materialOverlapPenalty:0,controlExcessScore:0,excessStun:0,excessSlow:0,rareConflict:0,wispCost:0,completion:0});
  const ordinary=[row('490H',2),row('XB0H',1)].sort(P._test.upperBlueprintCompare),favored=[row('490H',1),row('XB0H',2)].sort(P._test.upperBlueprintCompare);assert.deepStrictEqual(ordinary.map(item=>item.upperId),['490H','XB0H']);assert.deepStrictEqual(favored.map(item=>item.upperId),['XB0H','490H']);
});

test('hard control overflow still beats lower-tier hand fit',()=>{
  const row=(id,overflow,lower)=>({upperId:id,upperName:id,clearComplete:true,projectedCount:9,readiness:100,lineagePairs:0,rareClearedTypes:3,rareUsedTypes:3,rareUsed:7,controlCapOverflow:overflow,handFitMetrics:{rareScore:100,lowerScore:lower},materialOverlapPenalty:0,controlExcessScore:0,excessStun:0,excessSlow:0,rareConflict:0,wispCost:0,completion:0});
  const rows=[row('lower-fit',0,1),row('overflow',1,999)].sort(P._test.upperBlueprintCompare);assert.strictEqual(rows[0].upperId,'lower-fit');
});

test('future-only lower cards replace the old TMO tie-break in upper ordering',()=>{
  const counts={[C.WISP_ID]:20};for(const tier of TIERS){let added=0;for(const unit of units)if(C.tierKey(unit)===tier&&added++<15)counts[unit.id]=1;}const state=stateFromCounts(counts),policy=P._test.normalizeCommonPolicy({},state),used=P._test.consumptionTotals([],state),actual=P._test.handFitMetrics(state,state.counts,state.counts,used),best={counts:Object.assign({},state.counts),wisp:20,used,actions:[],handFit:actual};
  const allocation=id=>{const unit=state.db.byId.get(id);return P._test.fullHandAllocation(state,state.counts,best,[{id,name:C.displayNameOf(unit),unit,status:'future'}],policy);},better=allocation('T20h'),worse=allocation('340h');assert.deepStrictEqual(better.actualMetrics,worse.actualMetrics);assert.strictEqual(better.metrics.rareScore,worse.metrics.rareScore);assert.strictEqual(better.wisp.required,worse.wisp.required);assert(better.metrics.lowerScore>worse.metrics.lowerScore);
  const row=(id,metrics,completion)=>({upperId:id,upperName:id,clearComplete:true,projectedCount:9,readiness:100,lineagePairs:0,rareUsed:1,rareClearedTypes:1,rareUsedTypes:1,controlCapOverflow:0,handFitMetrics:metrics,materialOverlapPenalty:0,controlExcessScore:0,excessStun:0,excessSlow:0,rareConflict:0,wispCost:1,completion});const ranked=[row('future-better',better.metrics,0),row('old-tmo-winner',worse.metrics,100)].sort(P._test.upperBlueprintCompare);assert.strictEqual(ranked[0].upperId,'future-better');
});

test('future hard or item prerequisites make the proposed final hand infeasible',()=>{
  const state=stateFromCounts({[C.WISP_ID]:100}),policy=P._test.normalizeCommonPolicy({},state),used=P._test.consumptionTotals([],state),actual=P._test.handFitMetrics(state,state.counts,state.counts,used),best={counts:Object.assign({},state.counts),wisp:100,used,actions:[],handFit:actual},unit=state.db.byId.get('A30h'),allocation=P._test.fullHandAllocation(state,state.counts,best,[{id:unit.id,name:C.displayNameOf(unit),unit,status:'future'}],policy);assert(allocation.hardConflictTotal>0);assert(allocation.hardConflicts.length>0);assert.strictEqual(allocation.feasible,false);
});

test('an owned upper remains visible without fabricating the six missing board units',()=>{
  const state=stateFromCounts({[C.WISP_ID]:0,J40h:1}),row=P.rankUpperBlueprints({state,settings:Object.assign(settings(),{recommendWarped:false})},{candidateIds:['J40h']})[0];assert(row);assert.strictEqual(row.plan.plannedCount,3);assert.strictEqual(row.plan.plannedBoardCount,1);assert.strictEqual(row.plan.wispBudget.fullPartyFeasible,false);assert.strictEqual(row.wispFeasible,false);assert.strictEqual(row.handFeasible,false);assert.strictEqual(row.roleComplete,false);assert.strictEqual(row.clearComplete,false,'an owned upper alone must not become a clear claim');assert.strictEqual(row.plan.routeEvaluation.combatVerified,false);assert.strictEqual(row.safePrefix.basis,'current-tmo-stock-only');replaySafePrefix(state,row.safePrefix);
});

let passed=0;for(const [name,fn] of tests){try{fn();passed++;console.log('PASS',name);}catch(error){console.error('FAIL',name);throw error;}}
console.log(`Full-hand fit v14.0.0 tests: ${passed}/${tests.length} passed`);
