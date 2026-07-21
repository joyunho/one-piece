'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));

const C=global.ORDCore,units=global.ORD_TMO_UNITS,db=C.buildDb(units);
const RAYLEIGH='unit_1767884906256_4990',SHIP_MATERIAL='unit_1767884925665_1037',SUPER_KUMA=C.SUPER_KUMA_ID;
const baseSettings=extra=>Object.assign({mode:'',purpose:'',gorosei:'none',magicRoute:'auto',targetSquadCount:9,currentRound:1,manualCounts:{},superKumaOwned:true,allowWarped:true,recommendWarped:true},extra||{});
const byId=id=>{const unit=db.byId.get(id);assert(unit,`fixture unit missing: ${id}`);return unit;};
const status=(id,counts)=>C.specialPrerequisiteStatus(db,byId(id),counts||{});
function makeState(counts,progress,settings){
  const live=Object.entries(progress||{}).map(([id,tmoPercent])=>({id,tmoPercent}));
  return C.normalizeState(units,{at:Date.now(),units:live,counts:counts||{}},baseSettings(settings));
}

const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('Rayleigh-hidden recipes stay locked until Rayleigh-hidden is actually owned',()=>{
  const locked=status('A30h',{}),open=status('A30h',{[RAYLEIGH]:1});
  assert.deepStrictEqual([locked.allowed,locked.blocked],[false,true]);
  assert.deepStrictEqual(locked.missing.map(x=>[x.id,x.kind,x.count]),[[RAYLEIGH,'rayleigh',1]]);
  assert.deepStrictEqual([open.allowed,open.blocked,open.missing.length],[true,false,0]);
  const quantity=C.specialPrerequisiteStatus(db,{id:'fixture-double-rayleigh',name:'fixture',groupName:'전설 [물딜]',stuffs:[{id:RAYLEIGH,count:2}]},{[RAYLEIGH]:1});
  assert.deepStrictEqual(quantity.missing.map(x=>[x.id,x.count]),[[RAYLEIGH,1]]);
});

test('a ship unit needs the ship material and a ship-dependent upper needs the finished ship',()=>{
  const shipLocked=status('U30h',{}),shipOpen=status('U30h',{[SHIP_MATERIAL]:1});
  assert.deepStrictEqual(shipLocked.missing.map(x=>[x.id,x.kind]),[[SHIP_MATERIAL,'ship']]);
  assert.strictEqual(shipOpen.allowed,true);
  const upperLocked=status('2B0H',{[SUPER_KUMA]:1}),upperOpen=status('2B0H',{[SUPER_KUMA]:1,U30h:1});
  assert(upperLocked.missing.some(x=>x.id==='U30h'&&x.kind==='ship'));
  assert.strictEqual(upperOpen.allowed,true);
});

test('item-dependent units stay locked until the exact item is in the hand',()=>{
  const locked=status('KB0H',{[SUPER_KUMA]:1}),open=status('KB0H',{[SUPER_KUMA]:1,'700I':1});
  assert(locked.missing.some(x=>x.id==='700I'&&x.kind==='item'));
  assert.strictEqual(open.allowed,true);
});

test('other hard special prerequisites use the same data-driven gate',()=>{
  const locked=status('780h',{}),open=status('780h',{'unit_1767884970331_9084':1});
  assert.deepStrictEqual(locked.missing.map(x=>[x.id,x.kind]),[['unit_1767884970331_9084','special']]);
  assert.strictEqual(open.allowed,true);
});

test('Absalom and recipes containing Absalom keep the explicit exception',()=>{
  const absalom=status('010h',{}),ain=status('040h',{});
  assert.deepStrictEqual([absalom.allowed,absalom.blocked,absalom.exception],[true,false,true]);
  assert.deepStrictEqual([ain.allowed,ain.blocked,ain.exception],[true,false,true]);
  assert.strictEqual(absalom.missing.length,0);
  const counts={B20h:1,W30h:1,S10h:1,'100h':3,[C.WISP_ID]:20},settings=baseSettings({mode:'magic',currentRound:40}),state=makeState(counts,{},settings),spec=C.currentSpec(state,'magic',settings),row=C.candidateRow(state,byId('040h'),{mode:'magic',spec,deficits:C.deficits(spec,'magic',settings),settings,round:40,purpose:'spec',stock:state.counts,availableWisp:20});
  assert(!row.blocked.some(reason=>/좀비/.test(reason)),row.blocked.join(' · '));
  assert.strictEqual(row.feasible,true);
});

test('first legend ranking excludes locked recipes, then restores pure TMO order when unlocked',()=>{
  const rare=units.find(C.isRare);assert(rare);
  const counts={[rare.id]:1},settings=baseSettings({currentRound:15}),progress={A30h:100,V20h:90};
  const lockedState=makeState(counts,progress,settings),lockedPlan=C.recommendationPlan(lockedState,[],settings,global.ORD_UPPER_MEMO,global.ORD_SYNERGY_MEMO);
  assert.strictEqual(lockedPlan.purpose,'story');
  assert.strictEqual(lockedPlan.actions[0].unit.id,'V20h');
  assert.strictEqual(lockedPlan.actions[0].completionRank,1);
  assert(!lockedPlan.rows.some(row=>row.unit.id==='A30h'));
  const openState=makeState(Object.assign({},counts,{[RAYLEIGH]:1}),progress,settings),openPlan=C.recommendationPlan(openState,[],settings,global.ORD_UPPER_MEMO,global.ORD_SYNERGY_MEMO);
  assert.strictEqual(openPlan.actions[0].unit.id,'A30h');
  assert.deepStrictEqual(openPlan.actions.slice(0,2).map(row=>[row.unit.id,row.progress,row.completionRank]),[['A30h',100,1],['V20h',90,2]]);
});

test('first rare recommendations remain sorted only by transmitted TMO completion',()=>{
  const [a,b]=db.rares.slice(0,2),settings=baseSettings({currentRound:7}),state=makeState({}, {[a.id]:83,[b.id]:97},settings),plan=C.recommendationPlan(state,[],settings,global.ORD_UPPER_MEMO,global.ORD_SYNERGY_MEMO);
  assert.strictEqual(plan.purpose,'rare');
  assert.deepStrictEqual(plan.actions.slice(0,2).map(row=>[row.unit.id,row.progress,row.completionRank]),[[b.id,97,1],[a.id,83,2]]);
});

let failed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS  ${name}`);}catch(error){failed++;console.error(`FAIL  ${name}\n${error.stack}`);}
}
if(failed)process.exit(1);
console.log(`\n${tests.length}/${tests.length} prerequisite-gate checks passed.`);
