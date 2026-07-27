'use strict';

// v17.20: the author-supplied S~F prefix is a strategic prior, current-hand
// evidence can promote an Upper only inside bounded angle bands, and the
// Upper-specific support memo is a late tie-break after clear/resource gates.

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
  'ord_v15_policy.js','ord_v15_engine.js'
])require(path.join(EXT,file));

const C=global.ORDCore;
const P=global.ORDSquadPlanner;
const E=global.ORDV15Engine;
const Compactor=require(path.join(EXT,'ord_run_log_compactor.js'));
const catalog=global.ORD_TMO_UNITS;
const db=C.buildDb(catalog);

const upperTiers=db.uppers.map(unit=>({unit,tier:C.upperPowerTier(unit,db)}));
assert(upperTiers.length>=70,'unexpectedly small Upper catalogue');
assert.strictEqual(upperTiers.filter(row=>!row.tier.known).length,0,'an Upper was silently treated as unknown/F');
assert.strictEqual(C.upperPowerTier(db.byId.get('A90H'),db).letter,'S','Jinbe tier prefix was not parsed');
assert.strictEqual(C.upperPowerTier(db.byId.get('890H'),db).letter,'A','Robin tier prefix was not parsed');
assert.strictEqual(C.upperPowerTier(db.byId.get('F40h'),db).letter,'D','Gaban tier prefix was not parsed');
assert.deepStrictEqual(
  [C.upperPowerTier(db.byId.get('unit_1779054378124_5918'),db).letter,C.upperPowerTier(db.byId.get('unit_1779054378124_5918'),db).source],
  ['B','recipe-parent'],
  'Vegapunk variant did not inherit the single recipe-parent tier'
);

const baseRow={
  guaranteed:false,handFeasible:true,wispFeasible:true,safetyBand:1,
  powerTier:{known:true,letter:'A',rank:4},effectiveTierRank:4,angleBand:0,
  wispShortage:0,futureDependencyCount:0,
  upperPreparation:{materialReady:true,ordinaryMissing:0,wispGap:0,wispCost:0},
  roleComplete:true,requirementPriority:[],clearComplete:true,fullyBuildable:true,
  projectedCount:9,readiness:100,lineagePairs:0,controlCapOverflow:0,
  materialOverlapPenalty:0,rareConflict:0,rareClearedTypes:1,rareUsedTypes:1,
  rareUsed:1,wispCost:0,handFitMetrics:{},controlExcessScore:0,
  excessStun:0,excessSlow:0,memoPackage:{coreHits:0,score:0},
  prefixVector:[],prefixActionCount:1,prefixRequirementPriority:[],
  prefixRareRemaining:0,prefixWispUsed:0,prefixCommonPressure:0,tierUse:{},
  prefixStoryProxy:0,completion:50,upperName:'A',upperId:'a'
};
const row=(overrides={})=>Object.assign({},baseRow,overrides);
const tier=(letter,rank)=>({known:true,letter,rank});

assert(
  P._test.upperBlueprintCompare(
    row({powerTier:tier('A',4),effectiveTierRank:4,upperName:'A'}),
    row({powerTier:tier('D',1),effectiveTierRank:1,upperName:'D'})
  )<0,
  'a normal D-tier angle displaced a normal A-tier Upper'
);
assert(
  P._test.upperBlueprintCompare(
    row({guaranteed:true,safetyBand:3,powerTier:tier('D',1),effectiveTierRank:3,angleBand:3,upperName:'D perfect'}),
    row({guaranteed:false,safetyBand:0,powerTier:tier('S',5),effectiveTierRank:5,angleBand:0,upperName:'S future'})
  )<0,
  'a fully guaranteed exceptional angle could not beat a pure future S-tier plan'
);
assert(
  P._test.upperBlueprintCompare(
    row({safetyBand:2,powerTier:tier('C',2),effectiveTierRank:4,angleBand:3,upperName:'C perfect'}),
    row({safetyBand:2,powerTier:tier('A',4),effectiveTierRank:4,angleBand:0,upperName:'A future'})
  )<0,
  'the bounded +2 perfect-angle promotion was not applied'
);
assert(
  P._test.upperBlueprintCompare(
    row({safetyBand:2,powerTier:tier('A',4),effectiveTierRank:4,angleBand:0,upperName:'A'}),
    row({safetyBand:2,powerTier:tier('D',1),effectiveTierRank:3,angleBand:3,upperName:'D perfect'})
  )<0,
  'a D-tier Upper exceeded the +2 promotion cap'
);

assert.strictEqual(P._test.upperAngleBand(row({
  guaranteed:true,clearComplete:true,upperPreparation:{immediate:true},
  rareConflict:0,lineagePairs:0,controlCapOverflow:0
})),3);
assert.strictEqual(P._test.upperAngleBand(row({
  guaranteed:false,safePrefix:{checkpointPass:true},roleComplete:true,readiness:90,
  prefixActionCount:2,wispShortage:0,futureDependencyCount:0,
  rareConflict:0,lineagePairs:0,controlCapOverflow:0
})),2);
assert.strictEqual(P._test.upperAngleBand(row({
  safePrefix:{checkpointPass:true},projectedCount:6,readiness:75,prefixActionCount:2,
  rareConflict:0,lineagePairs:0,controlCapOverflow:0
})),1);
assert.strictEqual(P._test.upperAngleBand(row({rareConflict:1})),0,'a resource conflict received an angle promotion');

const jinbe=db.byId.get('A90H');
const sengoku=db.byId.get('630h');
const ivankov=db.byId.get('Y30h');
const queen=db.byId.get('IC0h');
P._test.setAffinityContext([jinbe],global.ORD_SYNERGY_MEMO);
assert.strictEqual(P._test.curatedSupportEvidence(sengoku).rank,1);
assert.strictEqual(P._test.curatedSupportEvidence(ivankov).rank,2);
assert.strictEqual(P._test.curatedSupportEvidence(queen).rank,3);
const lineupMemo=P._test.curatedLineupEvidence([sengoku,ivankov,queen]);
assert(Math.abs(lineupMemo.score-(1+1/2+1/3))<1e-6,'top-three reciprocal memo score changed');
const packageMemo=P._test.curatedPackageEvidence(jinbe,[sengoku,ivankov,queen],global.ORD_SYNERGY_MEMO);
assert.strictEqual(packageMemo.coreHits,3);
assert.deepStrictEqual(packageMemo.hits.map(item=>item.rank),[1,2,3]);
assert.strictEqual(P._test.resolveSupportMemo({synergyMemo:null}),null,'explicit memo disable fell back to a global memo');
P._test.setAffinityContext([],null);

function replayR25(){
  const log=JSON.parse(fs.readFileSync(path.join(ROOT,'data/ORD_2305_20260725_120442_active.ordlog.json'),'utf8'));
  let baseline=null,target=null,event=null;
  for(const item of log.events)if(item.type==='snapshot'){
    baseline=Compactor.applySnapshotRecord(baseline,item.payload,{digest:false});
    if(item.round===25){target=JSON.parse(JSON.stringify(baseline));event=item;}
  }
  assert(target&&event,'R25 compact snapshot missing');
  const wisp=Number(target.counts[C.WISP_ID]||22),snapshot={
    source:'replay',sessionId:'v17-20-r25',seq:event.seq,at:1,dataChangedAt:1,
    counts:target.counts,currentAbilities:target.currentAbilities,
    wispCountFound:true,wispCount:wisp,
    units:catalog.map(unit=>({id:unit.id,count:Number(target.counts[unit.id]||0),tmoPercent:Number(target.progress[unit.id]||0)}))
  };
  const settings={mode:'physical',magicRoute:'physical',currentRound:25,targetSquadCount:9,targetLegendEquivalent:9,gorosei:'none',postLegendRoute:'upper',superKumaOwned:true};
  return{snapshot,settings,state:C.normalizeState(catalog,snapshot,settings)};
}

const replay=replayR25();
const physicalPool=P._test.directionUpperShortlist(replay.state,'physical',8,{settings:replay.settings});
assert.deepStrictEqual(physicalPool.tierAnchors.map(item=>item.letter),['S','A','B'],'S/A/B shortlist anchors were cut before exact planning');
for(const anchor of physicalPool.tierAnchors)assert(physicalPool.ids.includes(anchor.id),`${anchor.letter} anchor is not in the shortlist`);

const decision=E.decide({catalog,snapshot:replay.snapshot,settings:replay.settings,locks:[]});
assert.strictEqual(decision.state,'ROUTE_CHOICE');
assert(decision.routeCandidates.length>0&&decision.routeCandidates.length<=6);
for(const candidate of decision.routeCandidates){
  assert(candidate.powerTier&&candidate.powerTier.known,`${candidate.name}: tier missing from engine output`);
  assert(['미래각','준비각','좋은각','완벽각'].includes(candidate.angleLabel),`${candidate.name}: angle label missing`);
  assert.strictEqual(candidate.blueprintEvaluation.powerTier.letter,candidate.powerTier.letter);
  for(const support of candidate.blueprintEvaluation.supports||[]){
    if(support.memoMatched){
      assert(support.memoRank>0,`${support.name}: memo match has no rank`);
      assert(candidate.memoPackage.hits.some(item=>item.id===support.id),`${support.name}: memo UI evidence is detached from the ranked package`);
    }
  }
}
const gabanIndex=decision.routeCandidates.findIndex(candidate=>candidate.id==='F40h');
assert(gabanIndex<0||gabanIndex>=3,`D-tier Gaban returned to the top three without an exceptional angle (${gabanIndex+1})`);

console.log('PASS every 2.305 Upper resolves an author tier without unknown→F coercion');
console.log('PASS safety bands and bounded angle promotions preserve high-tier defaults');
console.log('PASS Upper-specific support memo uses rank IDs as a late deterministic tie-break');
console.log('PASS S/A/B shortlist anchors and tier/angle evidence reach the V15 UI payload');
