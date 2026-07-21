'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore,units=global.ORD_TMO_UNITS;

function state(counts,currentAbilities){
  return C.normalizeState(units,{counts,currentAbilities:currentAbilities||{}},{manualCounts:{},superKumaOwned:true});
}
function settings(round){
  return{mode:'physical',magicRoute:'physical',currentRound:round,targetSquadCount:9,targetLegendEquivalent:9,gorosei:'nasjuro',superKumaOwned:true,allowWarped:true,recommendWarped:true};
}
function plan(counts,currentAbilities,round){
  return P.planFinalSquad({state:state(counts,currentAbilities),settings:settings(round),locks:[{stage:'upper',id:'I70h',source:'failed-run-regression'}]});
}

// Exact compact reconstruction of the failed run immediately after Mihawk was
// completed (log seq 559). Ten selection wisps remained, armor was only eight
// short, and slow was 77 short. The old planner spent 8-10 wisps on Bon Clay /
// Bartolomeo and thereby made the affordable Marco slow route impossible.
const r46Counts={
  '100h':7,'300h':2,'340h':1,'400h':1,'500h':7,'540h':1,'800h':3,'810e':10,
  '830h':1,'900h':4,'910h':1,D00h:2,I70h:1,K00h:4,M00h:2,M20h:1,N30h:1,
  W20h:1,X10h:1,unit_1767884906256_4990:1,unit_1767884925665_1037:1,
  unit_1779015467592_9245:1
};
const r46Abilities={'공격력 증가':45,'공격속도 증가':5,'공중이동':1,'광폭화':2,'바제스':2,'발동방어력 감소':15,'발동이동속도 감소':20,'방어력 감소':172,'보스 잡기':2,'스턴':.9,'이동속도 감소':30,'체력 재생':2.85};
const r46=plan(r46Counts,r46Abilities,46),r46First=r46.safePrefix.actions[0],baby5=(r46.timelineReadiness.rare.rows||[]).find(row=>row.id==='M20h');

assert(r46First,'R46 must expose a current-stock action');
assert.strictEqual(r46First.id,'T20h',`slow budget was not protected; received ${r46First.name}`);
assert.strictEqual(r46First.wispCost,5);
assert.strictEqual(r46.safePrefix.criticalRoleGuarded,true);
assert(!r46.safePrefix.actions.some(action=>['O30h','Z20h'].includes(action.id)),'armor/stun overspend survived the slow-budget guard');
assert(!r46.safePrefix.actions.some(action=>C.isShip(action.unit)),'a round-50 ship was recommended before it unlocked');
assert(baby5&&baby5.hold===1&&baby5.reroll===0,'Marco material was simultaneously exposed as reroll');
assert((baby5.destinations||[]).some(item=>item.id==='T20h'&&item.disposition==='hold'));
assert((r46.finalLineup||[]).some(row=>row.id==='T20h'),'the visible party blueprint contradicted the safe next action');

// Compact reconstruction immediately before Vivi changed was built (seq 678).
// The board already exceeded the minimum nine-equivalent target; the old
// target cap therefore returned no action and told the user to reroll Vivi.
const r55Counts={'540h':1,'810e':3,'830h':1,I70h:1,N30h:1,N70h:1,O10h:1,Q30h:1,W20h:1,Z20h:1,unit_1779015467592_9245:1,unit_1779016886375_9574:1};
const r55Abilities={'공격력 증가':45,'공격속도 증가':5,'공중이동':3,'광폭화':4,'바제스':2,'발동방어력 감소':15,'발동이동속도 감소':20,'방어력 감소':194,'보스 잡기':4,'스턴':1.8,'아머브레이크':1,'이동속도 감소':70,'체력 재생':4.1};
const r55=plan(r55Counts,r55Abilities,55),r55First=r55.safePrefix.actions[0],vivi=(r55.timelineReadiness.rare.rows||[]).find(row=>row.id==='O10h');

assert(r55First,'a board above the minimum target still needs deficit repair actions');
assert.strictEqual(r55First.id,'W50h');
assert.strictEqual(r55First.wispCost,0);
assert(vivi&&vivi.hold===1&&vivi.reroll===0,'Vivi was still shown in both make and reroll panels');
assert((r55.finalLineup||[]).some(row=>row.id==='W50h'));
assert.strictEqual(r55.wispBudget.fullPartyFeasible,false,'an affordable but slow-incomplete party was called fully feasible');
assert.strictEqual(r55.wispBudget.evidence,'role-incomplete');

// Uncapped live stun must be used when deciding whether a combat Rare is held.
const jozuState=state({E20h:1,'810e':0},{'스턴':1.8,'방어력 감소':180,'이동속도 감소':117,'보스 잡기':1,'광폭화':1}),jozuResult={mode:'physical',magicRoute:'physical',rareAllocation:[{id:'E20h',name:'죠즈',initial:1,spent:0,reserved:0,remaining:1,conflict:0,usedBy:[]}],finalLineup:[],projectedBoardCount:0,afterStock:jozuState.counts,safePrefix:{actions:[]}},jozu=P._test.rareDeadlineAssessment(jozuState,jozuResult,settings(55),[]).rows.find(row=>row.id==='E20h');
assert(jozu&&jozu.hold===0&&jozu.reroll===1,'excess live stun falsely protected Jozu');

const roleIncomplete=P._test.wispBudgetSummary({wisp:{initial:10,required:0,used:0,reserved:0,conflict:0}},9,9,false);
assert.strictEqual(roleIncomplete.withinBudget,true);
assert.strictEqual(roleIncomplete.fullPartyFeasible,false);
assert.strictEqual(roleIncomplete.evidence,'role-incomplete');

console.log('PASS failed R65 run now reserves slow before small armor/stun overspend');
console.log('PASS over-target Vivi repair and Rare reroll consistency');
console.log('PASS full-party budget requires role completion');
console.log('R65 slow-reservation regression: 4/4 passed');
