'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore,units=global.ORD_TMO_UNITS,db=C.buildDb(units);

const BLACK_MARIA_WARPED='unit_1752903381904_1445';
const LOCKED_UPPER='J40h';
const OWNED_FINAL_IDS=[
  LOCKED_UPPER,
  'unit_1779016886375_9574', // S-호크
  '830h',                    // 시저
  'S30h',                    // 울티(전설)
  'H30h',                    // 샬롯 크래커
  'Z20h',                    // 바르톨로메오
  '630h',                    // 센고쿠
  'P30h'                     // 발라티에
];

function fixtureCounts(){
  const counts={};
  for(const id of OWNED_FINAL_IDS)counts[id]=1;

  // The original failure had one of every Special card but no Rare,
  // Uncommon or Common stock. In this exact hand, Warped Black Maria consumes
  // ten Special cards and substitutes twelve missing Commons with wisps.
  for(const unit of db.specials)counts[unit.id]=1;
  for(const id of Object.keys(C.SPECIAL_IDS))counts[id]=1;
  counts[C.WISP_ID]=50;
  return counts;
}

function stateFromCounts(counts){
  return C.normalizeState(units,{source:'black-maria-12-wisp-regression',counts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});
}

function settings(){
  return{mode:'physical',currentRound:50,targetSquadCount:9,magicRoute:'auto',gorosei:'none',superKumaOwned:true,recommendWarped:true};
}

const counts=fixtureCounts(),state=stateFromCounts(counts),blackSolve=C.recipeSolve(state.db,BLACK_MARIA_WARPED,state.counts);

assert.strictEqual(blackSolve.wispCost,12,'fixture drift: Warped Black Maria must cost exactly twelve selection wisps');
assert.deepStrictEqual(blackSolve.lowestMissing,{
  '200h':1,
  '800h':2,
  '600h':2,
  '100h':3,
  '400h':3,
  '300h':1
});

const result=P.planFinalSquad({
  state,
  settings:settings(),
  locks:[{stage:'upper',id:LOCKED_UPPER}]
});
const finalIds=result.finalLineup.map(row=>row.id),planned=result.roleCoverage&&result.roleCoverage.planned||{},plannedSpec=planned.spec||{};
const totalActionWisp=result.actions.reduce((total,action)=>total+C.num(action.wispCost),0);

assert.strictEqual(result.targetCount,9,'the target must remain nine Legend-equivalents');
assert.strictEqual(result.targetBoardCount,7,'one Upper must reduce the physical board target to seven units');
assert(result.projectedCount>=9,'the low-wisp replacement must still produce at least nine Legend-equivalents');
assert(result.plannedCount>=9,'the displayed final squad must retain at least nine Legend-equivalents');
assert(result.finalLineup.length>=result.targetBoardCount,'the displayed board fell below its weighted target');
assert(!finalIds.includes(BLACK_MARIA_WARPED),`12-wisp Warped Black Maria was still selected: ${result.actions.map(action=>`${action.name}(${action.wispCost})`).join(', ')}`);
assert(totalActionWisp<blackSolve.wispCost,`replacement used ${totalActionWisp} wisps; it must be cheaper than Warped Black Maria's ${blackSolve.wispCost}`);
assert.strictEqual(C.num(result.resourceUse&&result.resourceUse.wisp),totalActionWisp,'reported wisp use differs from the sequential build actions');
assert(C.num(plannedSpec.armor)>=180,`static armor reduction is below the physical operating floor: ${C.num(plannedSpec.armor)}/180`);

console.log('PASS 12-wisp Warped Black Maria is rejected for a cheaper operating-floor armor replacement');
console.log(`Black Maria low-wisp regression v14.0.0: 1/1 passed · replacement ${result.actions.map(action=>`${action.name} 선위${action.wispCost}`).join(' + ')} · 상시 방깎 ${plannedSpec.armor}`);
