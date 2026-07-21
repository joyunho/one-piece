'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_core.js','ord_squad_planner.js','ord_app.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const App=global.ORDApp.App;
const catalog=global.ORD_TMO_UNITS;
const db=C.buildDb(catalog);

function physicalState(counts,round=45){
  return C.normalizeState(catalog,{source:'stock-basis-fixture',counts,units:[],currentAbilities:{}},{
    currentRound:round,mode:'physical',manualCounts:{},superKumaOwned:true
  });
}

// A deterministic real-card fixture: Laboon consumes the only shared Brook.
// Black Maria must therefore be displayed with its post-queue cost, while the
// untouched-hand value remains available as a separate comparison.
{
  const LABOON='Q20h';
  const BLACK_MARIA='unit_1752903381904_1445';
  const BROOK='N10h';
  const counts={
    [C.WISP_ID]:50,
    X20h:1,
    [BROOK]:1,
    S00h:1,
    W10h:1,
    '620h':1
  };
  const state=physicalState(counts,45),laboon=db.byId.get(LABOON),blackMaria=db.byId.get(BLACK_MARIA);
  const currentSolve=C.recipeSolve(state.db,blackMaria.id,state.counts);
  assert.strictEqual(currentSolve.wispCost,0,'fixture must begin with a completed Black Maria recipe');

  const laboonSolve=C.recipeSolve(state.db,laboon.id,state.counts);
  assert.strictEqual(laboonSolve.wispCost,0);
  assert.strictEqual(C.num(laboonSolve.consumed[BROOK]),1);
  const built=C.applyBuildStep(state,C.currentSpec(state,'physical',{currentRound:45}),state.counts,laboon,'physical',50);
  assert.strictEqual(C.num(built.stock[BROOK]),0);
  const plannedSolve=C.recipeSolve(state.db,blackMaria.id,built.stock);
  assert.strictEqual(plannedSolve.wispCost,12,'post-Laboon stock did not reprice Black Maria');

  const watch={
    unit:blackMaria,
    currentSolve,
    solve:plannedSolve,
    availableWisp:built.remainingWisp,
    wispBreakdown:{basis:'sequential',current:currentSolve.wispCost,planned:plannedSolve.wispCost,available:built.remainingWisp}
  };
  const display=App.prototype.wispDisplay.call({},state,watch);
  assert.deepStrictEqual(
    [display.current,display.planned,display.basis,display.basisLabel,display.different],
    [0,12,'sequential','앞 제작 차감 후',true]
  );
  console.log(`PASS  sequential watch repricing: ${C.nameOf(watch.unit)} ${display.current}→${display.planned}선위 · shared ${C.materialName(state.db,BROOK)}`);
}

// One raw pirate ship is a unique prerequisite. Reserving or consuming it for
// Red Force must make Moby Dick unavailable in the same working stock.
{
  const SHIP_MATERIAL='unit_1767884925665_1037';
  const FIRST_SHIP='U30h';
  const SECOND_SHIP='Q30h';
  const counts={[C.WISP_ID]:100,[SHIP_MATERIAL]:1};
  for(const unit of catalog)if(C.isCommon(unit)||C.isUncommon(unit)||C.isSpecialTier(unit)||C.isRare(unit))counts[unit.id]=20;
  counts[C.WISP_ID]=100;counts[SHIP_MATERIAL]=1;
  const state=physicalState(counts,55),settings={currentRound:55,mode:'physical',superKumaOwned:true,recommendWarped:true};
  const spec=C.currentSpec(state,'physical',settings),deficits=C.deficits(spec,'physical',settings);
  const context=(stock,basis)=>({
    mode:'physical',settings,round:55,purpose:'spec',stock,ruleCounts:stock,
    availableWisp:100,costBasis:basis,spec,deficits
  });
  const first=db.byId.get(FIRST_SHIP),second=db.byId.get(SECOND_SHIP);
  assert(first&&second,'real pirate-ship fixture IDs are missing');
  const firstRow=C.candidateRow(state,first,context(state.counts,'current'));
  assert.strictEqual(firstRow.feasible,true,firstRow.blocked.join(' · '));
  assert.strictEqual(C.num(firstRow.solve.consumed[SHIP_MATERIAL]),1);

  const reserved=C.reserveTargets(state.db,state.counts,[FIRST_SHIP]);
  assert.strictEqual(C.num(reserved.stock[SHIP_MATERIAL]),0,'route reservation did not debit the unique ship');
  assert.strictEqual(C.specialPrerequisiteStatus(state.db,second,reserved.stock).allowed,false);
  const afterReservation=C.candidateRow(state,second,context(reserved.stock,'protected'));
  assert.strictEqual(afterReservation.feasible,false,'candidate reused a ship already reserved by another route');
  assert(afterReservation.blocked.some(reason=>/해적선 필요/.test(reason)),afterReservation.blocked.join(' · '));

  const built=C.applyBuildStep(state,spec,state.counts,first,'physical',100);
  assert.strictEqual(C.num(built.stock[SHIP_MATERIAL]),0,'build did not consume the unique ship');
  const afterConsumption=C.candidateRow(state,second,context(built.stock,'sequential'));
  assert.strictEqual(afterConsumption.feasible,false,'candidate reused a ship already consumed by a preceding action');
  assert(afterConsumption.blocked.some(reason=>/해적선 필요/.test(reason)),afterConsumption.blocked.join(' · '));
  console.log(`PASS  unique prerequisite follows working stock: ${C.nameOf(first)} → ${C.nameOf(second)} blocked`);
}
