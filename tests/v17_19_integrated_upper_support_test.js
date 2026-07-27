'use strict';

// v17.19: Upper and its supporting Legends are one strategic ranking unit.
// Replays the last supplied R25 hand where the old standalone clearValue order
// was Cavendish #1 / Gaban #2 despite four/zero projected dead-end evidence.

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of [
  'ord_story_nonupper_data.js','ord_story_upper_data.js','ord_units_data.js',
  'ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js',
  'ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js',
  'ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js',
  'ord_v15_policy.js','ord_v15_engine.js','ord_app.js'
])require(path.join(EXT,file));

const C=global.ORDCore;
const P=global.ORDSquadPlanner;
const E=global.ORDV15Engine;
const App=global.ORDApp.App;
const Compactor=require(path.join(EXT,'ord_run_log_compactor.js'));
const catalog=global.ORD_TMO_UNITS;

function replayR25(){
  const log=JSON.parse(fs.readFileSync(path.join(ROOT,'data/ORD_2305_20260725_120442_active.ordlog.json'),'utf8'));
  let baseline=null,target=null,event=null;
  for(const item of log.events)if(item.type==='snapshot'){
    baseline=Compactor.applySnapshotRecord(baseline,item.payload,{digest:false});
    if(item.round===25){target=JSON.parse(JSON.stringify(baseline));event=item;}
  }
  assert(target&&event,'R25 compact snapshot missing');
  const wisp=Number(target.counts[C.WISP_ID]||22),snapshot={
    source:'replay',sessionId:'v17-19-r25',seq:event.seq,at:1,dataChangedAt:1,
    counts:target.counts,currentAbilities:target.currentAbilities,
    wispCountFound:true,wispCount:wisp,
    units:catalog.map(unit=>({id:unit.id,count:Number(target.counts[unit.id]||0),tmoPercent:Number(target.progress[unit.id]||0)}))
  };
  const settings={mode:'physical',magicRoute:'physical',currentRound:25,targetSquadCount:9,targetLegendEquivalent:9,gorosei:'none',postLegendRoute:'upper',superKumaOwned:true};
  return{snapshot,settings,state:C.normalizeState(catalog,snapshot,settings)};
}

const replay=replayR25();
const decision=E.decide({catalog,snapshot:replay.snapshot,settings:replay.settings,locks:[]});
assert.strictEqual(decision.state,'ROUTE_CHOICE');
assert.strictEqual(decision.evidence.rankingAuthority,'upper-plus-support-full-squad');
assert(decision.routeCandidates.length>0&&decision.routeCandidates.length<=6);

for(let index=0;index<decision.routeCandidates.length;index++){
  const row=decision.routeCandidates[index],bundle=row.blueprintEvaluation;
  assert(bundle&&bundle.basis==='upper-plus-support-full-squad',`${row.name}: integrated bundle missing`);
  assert.strictEqual(bundle.rank,index+1,`${row.name}: displayed order differs from bundle order`);
  assert(bundle.supports.length<=3,'support preview exceeds three');
  for(const support of bundle.supports){
    const unit=replay.state.db.byId.get(support.id);
    assert(unit&&!C.isUpper(unit)&&!C.isShip(unit),`${support.name}: invalid support preview`);
  }
}

const gabanIndex=decision.routeCandidates.findIndex(row=>row.id==='F40h');
const cavendishIndex=decision.routeCandidates.findIndex(row=>row.id==='B50h');
assert(gabanIndex>=3,`Gaban remained a top-three standalone recommendation (${gabanIndex+1})`);
assert(cavendishIndex>=3,`Cavendish remained a top-three standalone recommendation (${cavendishIndex+1})`);
assert(decision.routeCandidates.slice(0,3).every(row=>row.blueprintEvaluation.plannedEquivalent>=5),'top bundle did not improve the planned party over old four-equivalent leaders');
assert(decision.routeCandidates.some((row,index)=>index>0&&row.clearValue.value>decision.routeCandidates[index-1].clearValue.value),'standalone clearValue still controls the displayed order');

const candidateIds=decision.routeCandidates.map(row=>row.id),rankInput={
  catalog,state:replay.state,settings:replay.settings,locks:[]
};
const forward=P.rankUpperBlueprints(rankInput,{candidateIds}).map(row=>row.upperId);
const reversed=P.rankUpperBlueprints(rankInput,{candidateIds:candidateIds.slice().reverse()}).map(row=>row.upperId);
assert.deepStrictEqual(reversed,forward,'upper affinity leaked across candidate order');

const selected=decision.routeCandidates[0],squad=P.planAdaptiveFinalSquad({
  catalog,state:replay.state,
  settings:Object.assign({},replay.settings,{upperPreviewId:selected.id}),
  locks:[],upperBlueprint:null
},{minTarget:9,maxTarget:11});
assert(squad.adaptiveTargets,'adaptive target audit missing');
assert.strictEqual(squad.adaptiveTargets.attempts[0].target,9);
assert.strictEqual(squad.adaptiveTargets.basis,'full-reoptimization-per-legend-equivalent');
if(!squad.adaptiveTargets.attempts[0].accepted)assert.strictEqual(squad.adaptiveTargets.attempts.length,1,'10/11 was attempted before the core nine was feasible');

const app=Object.create(App.prototype);
app.state={locks:[{stage:'upper',id:selected.id}],directionUpperId:selected.id,mode:'physical',magicRoute:'physical',currentRound:25,rerollsUsed:0,snapshot:replay.snapshot};
app._normalizedCacheKey='r25';
const spec=C.currentSpec(replay.state,'physical',{_upperUnit:replay.state.db.byId.get(selected.id)});
const deficits=C.deficits(spec,'physical',{magicRoute:'physical',_upperUnit:replay.state.db.byId.get(selected.id)});
const supportRows=app.v151BuildableLegendRows(replay.state,{mode:'physical',settings:replay.settings,upper:replay.state.db.byId.get(selected.id),spec,deficits,squadPlan:squad});
assert(supportRows.length>0&&supportRows.length<=3,'support recommendation count is not 1..3');
const plannedIds=new Set((squad.finalLineup||[]).map(row=>row.id));
assert(plannedIds.has(supportRows[0].unit.id),'first support recommendation is detached from the global party');

const rare=replay.state.db.rares.find(unit=>Number(replay.state.counts[unit.id])>0);
assert(rare,'owned Rare fixture missing');
const guarded=app.v151ProtectRareDecision({
  state:'REROLL_ONE',label:'희귀 1장 리롤',reason:'local horizon',action:null,
  rare:{rows:[{id:rare.id,name:C.displayNameOf(rare),initial:1,use:0,hold:0,reroll:1,proof:{exclusive:true}}],use:[],hold:[],reroll:[],safeReroll:{id:rare.id,name:C.displayNameOf(rare)}}
},{targetCount:9,rareAllocation:[{id:rare.id,spent:0,reserved:1,usedBy:[{name:'후속 전설'}]}],unusedRare:[]},replay.state);
assert.strictEqual(guarded.state,'HOLD','global party Rare reservation did not cancel an unsafe local reroll');
assert.strictEqual(guarded.rare.rows[0].hold,1);
assert.strictEqual(guarded.rare.rows[0].reroll,0);

console.log('PASS R25 standalone Cavendish/Gaban leaders are replaced by integrated Upper+support bundles');
console.log('PASS candidate order cannot leak the previous Upper affinity context');
console.log('PASS support recommendations are capped at three and anchored to the same global party');
console.log('PASS 9→10→11 uses full re-optimisation and core-nine gating');
console.log('PASS global party Rare reservation overrides the two-step reroll horizon');
