'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore,units=global.ORD_TMO_UNITS;

// Minimal reconstruction of snapshot seq 311 from the failed-run log.  The
// old exact-prefix ranking chose 21-wisp Warped Ace even though it still left
// the round-40 checkpoint open.  Bartolomeo closes the same-priority stun gate
// for eight wisps and preserves enough budget to keep adapting.
const counts={
  '100h':8,'200h':2,'210h':1,'300h':1,'400h':6,'410h':1,'500h':6,'600h':5,
  '700h':7,'800h':6,'810e':23,'900h':1,'910h':1,A30h:1,D00h:1,E20h:1,J40h:1,
  K00h:1,M30h:1,O00h:1,P00h:1,Q00h:2,S00h:2,unit_1767884970331_9084:1
};
const currentAbilities={'공격력 증가':90,'광폭화':1,'바제스':3,'발동이동속도 감소':11,'방어력 감소':100,'보조딜':1,'스턴':.2,'아머브레이크':1,'이동속도 감소':75};
const settings={mode:'physical',magicRoute:'auto',currentRound:35,targetSquadCount:9,gorosei:'nasjuro',superKumaOwned:true,allowWarped:true};
const state=C.normalizeState(units,{counts,currentAbilities},settings),ace=C.recipeSolve(state.db,'unit_1779015467592_9245',state.counts),blackMaria=C.recipeSolve(state.db,'unit_1752903381904_1445',state.counts),result=P.planFinalSquad({state,settings,locks:[{stage:'upper',id:'J40h'}]}),prefix=result.safePrefix,first=prefix.actions[0],stun=(prefix.stage.requirements.rows||[]).find(row=>row.key==='stunBase');

assert.strictEqual(ace.wispCost,21,'failed-run fixture drift: Warped Ace cost changed');
assert.strictEqual(blackMaria.wispCost,11,'failed-run fixture drift: Warped Black Maria cost changed');
assert.strictEqual(prefix.economyGuarded,true,'non-closing high-wisp candidates were not filtered');
assert(first,'an immediately craftable recovery action is required');
assert.strictEqual(first.id,'Z20h',`expected Bartolomeo, received ${first.name}`);
assert.strictEqual(first.wispCost,8);
assert(stun&&stun.gap<=0,'the economical replacement did not close minimum 0.5 stun');
assert(!prefix.actions.some(action=>C.isWarped(action.unit)),'a warped candidate survived the economy guard');
assert.match(prefix.note,/고비용 후보를 제외/);

console.log('PASS failed-run R35 economy guard rejects 21-wisp Ace and 11-wisp Black Maria');
console.log('R35 log economy-guard regression: 1/1 passed');
