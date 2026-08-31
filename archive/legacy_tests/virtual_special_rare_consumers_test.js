'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const C=global.ORDCore,units=global.ORD_TMO_UNITS;

const VIRTUAL_SPECIAL='K10h'; // 152킬 보상으로 선택한 X-드레이크(특별함)
const DIRECT_RARE_CONSUMERS=['X90h','Q10h','120h','H40h','620h'];

function settings(virtualSpecialId){
  return{
    mode:'physical',currentRound:1,virtualSpecialId,
    superKumaOwned:true,manualCounts:{},wispOverride:100,
    recommendWarped:false,gorosei:'none'
  };
}
function state(virtualSpecialId){
  const opts=settings(virtualSpecialId);
  return C.normalizeState(units,{source:'virtual-special-rare-consumer-test',counts:{[C.WISP_ID]:100},currentAbilities:{}},opts);
}
function rareConsumersOfVirtualSpecial(currentState,virtualSpecialId){
  return currentState.db.rares.map(unit=>{
    // Solve every unowned Rare against the same current hand. The selected
    // virtual Special is a one-card alternative for the first Rare, so these
    // rows are alternatives, not a queue that may all reserve the card.
    const solve=C.recipeSolve(currentState.db,unit.id,currentState.counts);
    const used=C.num(solve.consumed&&solve.consumed[virtualSpecialId]);
    return used>0?{unit,solve,used}:null;
  }).filter(Boolean);
}

const withVirtual=state(VIRTUAL_SPECIAL),withoutVirtual=state('');

assert.strictEqual(C.num(withVirtual.rawCounts[VIRTUAL_SPECIAL]),0,'fixture must not contain a real TMO Special count');
assert.strictEqual(withVirtual.counts[VIRTUAL_SPECIAL],1,'the selected 152-kill Special was not injected into recipe stock');
assert.strictEqual(withVirtual.virtualId,VIRTUAL_SPECIAL);
assert.strictEqual(withVirtual.virtualResolved,false);

const consumers=rareConsumersOfVirtualSpecial(withVirtual,VIRTUAL_SPECIAL);
assert.deepStrictEqual(
  consumers.map(row=>row.unit.id).sort(),
  DIRECT_RARE_CONSUMERS.slice().sort(),
  'Rare candidates consuming the selected virtual Special were not identified exactly'
);
for(const row of consumers)assert.strictEqual(row.used,1,`${row.unit.id} did not consume exactly one virtual Special`);

// X-드레이크(희귀) is a stable numerical fixture: owning its selected
// X-드레이크(특별함) material lowers its missing-Common/selection-wisp cost
// from 15 to 10.
const helped=C.recipeSolve(withVirtual.db,'X90h',withVirtual.counts);
const unhelped=C.recipeSolve(withoutVirtual.db,'X90h',withoutVirtual.counts);
assert.strictEqual(helped.consumed[VIRTUAL_SPECIAL],1);
assert.strictEqual(helped.wispCost,10);
assert.strictEqual(unhelped.wispCost,15);

const plan=C.recommendationPlan(withVirtual,[],settings(VIRTUAL_SPECIAL));
assert.strictEqual(plan.purpose,'rare');
const visibleConsumers=plan.rows
  .filter(row=>C.isRare(row.unit)&&C.num(row.solve&&row.solve.consumed&&row.solve.consumed[VIRTUAL_SPECIAL])>0)
  .map(row=>row.unit.id)
  .sort();
assert.deepStrictEqual(visibleConsumers,DIRECT_RARE_CONSUMERS.slice().sort());
assert(
  plan.actions.length>0&&plan.actions.every(row=>C.num(row.solve.consumed[VIRTUAL_SPECIAL])===1),
  'first-Rare recommendations ignored the selected 152-kill Special'
);

console.log(`PASS selected 152-kill Special is counted by ${consumers.length} Rare recipes`);
console.log(`Virtual Special Rare-consumer regression: 1/1 passed · X-드레이크(희귀) ${unhelped.wispCost}→${helped.wispCost}선위`);
