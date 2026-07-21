'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore,units=global.ORD_TMO_UNITS,db=C.buildDb(units);

function stateFromCounts(counts){return C.normalizeState(units,{counts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});}
function stockedCounts(){const counts={[C.WISP_ID]:80};for(const unit of units){if(C.isCommon(unit))counts[unit.id]=16;else if(C.isUncommon(unit))counts[unit.id]=8;else if(C.isSpecialTier(unit))counts[unit.id]=5;}for(const id of Object.keys(C.SPECIAL_IDS))counts[id]=4;for(const rare of db.rares.slice(0,8))counts[rare.id]=1;return counts;}

const tests=[];function test(name,fn){tests.push([name,fn]);}

test('a complete future blueprint never passes the round-50 actual-board gate',()=>{
  const state=stateFromCounts(stockedCounts()),result=P.planFinalSquad({state,settings:{mode:'physical',currentRound:50,targetSquadCount:9,superKumaOwned:true},locks:[{stage:'upper',id:'J40h'}]}),timeline=result.timelineReadiness;
  assert(timeline,'timeline readiness is missing');
  assert.strictEqual(timeline.source,'tmo-live-roles+owned-final-count');
  assert.strictEqual(timeline.actual.legendEquivalent,0,'materials or planned units leaked into actual board');
  assert(result.plannedLegendEquivalent>=timeline.actual.legendEquivalent);
  assert.strictEqual(timeline.boss50.status,'blocked');
  assert.strictEqual(timeline.boss50.verified,false);
});

test('two unassigned rares at round 50 are reroll, not anonymous hold',()=>{
  const first=db.byId.get('Q10h'),second=db.byId.get('L10h'),state=stateFromCounts({[first.id]:1,[second.id]:1,[C.WISP_ID]:0}),result={mode:'physical',rareAllocation:[first,second].map(unit=>({id:unit.id,name:C.displayNameOf(unit),initial:1,spent:0,reserved:0,remaining:1,conflict:0,usedBy:[]})),finalLineup:[],projectedBoardCount:0},rare=P._test.rareDeadlineAssessment(state,result,{currentRound:50,mode:'physical'},[]);
  assert.strictEqual(rare.owned,2);
  assert.strictEqual(rare.actionableReserved,0);
  assert.strictEqual(rare.unassigned,2);
  assert.strictEqual(rare.pass,false);
  assert(rare.rows.every(row=>row.reroll===1));
});

test('a rare directly covering the live slow deficit is held instead of rerolled',()=>{
  const kid=db.byId.get('D20h'),state=stateFromCounts({[kid.id]:1,[C.WISP_ID]:0}),result={mode:'physical',magicRoute:'physical',rareAllocation:[{id:kid.id,name:C.displayNameOf(kid),initial:1,spent:0,reserved:0,remaining:1,conflict:0,usedBy:[]}],finalLineup:[],projectedBoardCount:0},rare=P._test.rareDeadlineAssessment(state,result,{currentRound:55,mode:'physical',gorosei:'nasjuro'},[]),row=rare.rows[0];
  assert.strictEqual(rare.actionableReserved,1);
  assert.strictEqual(rare.unassigned,0);
  assert.strictEqual(row.hold,1);
  assert.strictEqual(row.reroll,0);
  assert.match(row.reason,/현재 전투 결손 직접 보완.*이감/);
  assert(row.destinations.some(item=>item.id===`combat:${kid.id}`&&item.disposition==='hold'));
});

test('timeline combat roles include a live Rare while final-equivalent count does not',()=>{
  const kid=db.byId.get('D20h'),state=stateFromCounts({[kid.id]:1,[C.WISP_ID]:0}),settings={currentRound:55,mode:'physical',magicRoute:'physical',gorosei:'nasjuro'},result={mode:'physical',magicRoute:'physical',afterStock:Object.assign({},state.counts),rareAllocation:[{id:kid.id,name:C.displayNameOf(kid),initial:1,spent:0,reserved:0,remaining:1,conflict:0,usedBy:[]}],finalLineup:[],projectedBoardCount:0,plannedBoardCount:0,plannedLegendEquivalent:0,actions:[]},timeline=P._test.timelineReadiness(state,result,settings,[]),slow=(timeline.actual.requirements.rows||[]).find(row=>row.key==='slow');
  assert.strictEqual(timeline.actual.legendEquivalent,0,'Rare leaked into the final-equivalent count');
  assert.strictEqual(timeline.actual.spec.slow,15,'live Rare slow was omitted from the combat specification');
  assert(slow&&slow.current===15,'timeline requirement did not use the live combat specification');
  assert.strictEqual(timeline.rare.actionableReserved,1);
});

test('future-drop reservations expire at round 40 while a locked upper rare stays protected',()=>{
  const rare=db.byId.get('Q10h'),upper=db.byId.get('J40h'),state=stateFromCounts({[rare.id]:1,[C.WISP_ID]:0}),row={id:upper.id,name:C.displayNameOf(upper),unit:upper,status:'future',futureDropPending:true,prerequisite:{allowed:true}},allocation={id:rare.id,name:C.displayNameOf(rare),initial:1,spent:0,reserved:1,remaining:0,conflict:0,usedBy:[{id:upper.id,name:C.displayNameOf(upper),count:1,status:'reserved'}]},result={mode:'physical',rareAllocation:[allocation],finalLineup:[row],projectedBoardCount:0},free=P._test.rareDeadlineAssessment(state,result,{currentRound:40,mode:'physical'},[]),locked=P._test.rareDeadlineAssessment(state,result,{currentRound:40,mode:'physical'},[upper.id]);
  assert.strictEqual(free.unassigned,1,'soft future reservation survived its deadline');
  assert.strictEqual(free.actionableReserved,0);
  assert.strictEqual(locked.unassigned,0,'locked upper material was exposed to reroll');
  assert.strictEqual(locked.actionableReserved,1);
});

test('round checkpoints expose actual, immediately craftable and blueprint counts separately',()=>{
  const state=stateFromCounts(stockedCounts()),result=P.planFinalSquad({state,settings:{mode:'physical',currentRound:45,targetSquadCount:9,superKumaOwned:true},locks:[{stage:'upper',id:'J40h'}]}),timeline=result.timelineReadiness;
  assert.strictEqual(timeline.actual.legendEquivalent,0);
  assert(timeline.craftableNow.legendEquivalent>=timeline.actual.legendEquivalent);
  assert(timeline.blueprint.legendEquivalent>=timeline.craftableNow.legendEquivalent);
  assert.strictEqual(timeline.currentCheckpoint.dueRound,30,'가장 먼저 놓친 실제 마감부터 복구해야 합니다.');
  assert.notStrictEqual(timeline.currentCheckpoint.status,'passed','craftable or future units were accepted as actual');
});

let passed=0;for(const [name,fn] of tests){try{fn();passed++;console.log('PASS',name);}catch(error){console.error('FAIL',name);throw error;}}
console.log(`R50 survival-gate hotfix tests: ${passed}/${tests.length} passed`);
