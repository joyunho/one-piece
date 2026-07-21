'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore,units=global.ORD_TMO_UNITS,db=C.buildDb(units);

const ACE_LEGEND='O20h';
const ACE_WARPED='unit_1779015467592_9245';
const ACE_ETERNAL='950h';
const MIHAWK_ETERNAL='850h';
const SHIP_MATERIAL='unit_1767884925665_1037';

function stateFromCounts(counts={}){
  return C.normalizeState(units,{source:'v14.0.0-test',counts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});
}
function settings(mode,recommendWarped=false){
  return{mode,currentRound:55,targetSquadCount:9,magicRoute:mode==='magic'?'singleEnd':'auto',gorosei:'none',superKumaOwned:true,recommendWarped};
}
function allowed(state,id,recommendWarped=false){
  const unit=state.db.byId.get(id),mode=C.familyOf(unit),route=mode==='magic'?'singleEnd':'physical';
  return P._test.allowedCandidate(unit,mode,route,settings(mode,recommendWarped),state,state.counts);
}
function abundantState(){
  const counts={[C.WISP_ID]:120};
  for(const unit of units)if(C.isCommon(unit)||C.isUncommon(unit)||C.isSpecialTier(unit)||C.isRare(unit))counts[unit.id]=10;
  for(const id of Object.keys(C.SPECIAL_IDS))counts[id]=10;
  return stateFromCounts(counts);
}

const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('legacy warped switches normalize to always allowed',()=>{
  const normalized=P._test.normalizeSettings({settings:{mode:'physical',allowWarped:true}});
  assert.strictEqual(normalized.allowWarped,true,'warped wood availability must remain always on');
  assert.strictEqual(normalized.recommendWarped,true,'warped recommendations must remain always on');
  const explicitlyOff=P._test.normalizeSettings({settings:{mode:'physical',allowWarped:false,recommendWarped:false}});
  assert.strictEqual(explicitlyOff.allowWarped,true);
  assert.strictEqual(explicitlyOff.recommendWarped,true);
  assert.strictEqual(P._test.normalizeSettings({settings:{mode:'physical',recommendWarped:true}}).recommendWarped,true);
});

test('direct and transitive warped recipes stay eligible even when stale settings say off',()=>{
  const blank=stateFromCounts({[C.WISP_ID]:100});
  for(const id of [ACE_WARPED,ACE_ETERNAL]){
    assert.strictEqual(C.requiresWarpedCraft(blank.db,blank.db.byId.get(id),blank.counts),true,id);
    assert.strictEqual(allowed(blank,id,false),true,`${id} remained blocked by a removed switch`);
    assert.strictEqual(allowed(blank,id,true),true,`${id} unexpectedly blocked`);
  }

  const shipReady=stateFromCounts({[C.WISP_ID]:100,[SHIP_MATERIAL]:2});
  assert.strictEqual(C.requiresWarpedCraft(shipReady.db,shipReady.db.byId.get(MIHAWK_ETERNAL),shipReady.counts),true);
  assert.strictEqual(allowed(shipReady,MIHAWK_ETERNAL,false),true);
  assert.strictEqual(allowed(shipReady,MIHAWK_ETERNAL,true),true);
});

test('an already-owned warped unit remains usable and contributes to the live spec',()=>{
  const state=stateFromCounts({[ACE_WARPED]:1}),unit=state.db.byId.get(ACE_WARPED),off=settings('physical',false);
  assert.strictEqual(C.requiresWarpedCraft(state.db,unit,state.counts),false);
  assert.strictEqual(allowed(state,ACE_WARPED,false),true);
  assert(P._test.finalEntries(state,state.counts).some(candidate=>candidate.id===ACE_WARPED));
  const spec=C.currentSpec(state,'physical',off);
  assert.deepStrictEqual([spec.slow,spec.armor,spec.attack],[20,40,20]);
});

test('recipe profiles expose the Ace ancestor and its full transitive Rare demand',()=>{
  const state=stateFromCounts(),legend=state.db.byId.get(ACE_LEGEND),warped=state.db.byId.get(ACE_WARPED),profile=P._test.recipeProfile(state,warped),pair=P._test.pairMaterialOverlap(state,legend,warped);
  assert(profile.finalAncestors.has(ACE_LEGEND));
  assert(profile.warpedNodes.has(ACE_WARPED));
  assert.deepStrictEqual(profile.rare,{'220h':1,Y10h:1,'120h':1,Z10h:1});
  assert.strictEqual(pair.lineage,true);
  assert.strictEqual(pair.rare,3);
  assert(pair.penalty>400,`ancestor overlap penalty ${pair.penalty}`);
});

test('upgrading Ace to warped is allowed, but rebuilding both into the final party is rejected',()=>{
  const state=stateFromCounts(),legend=state.db.byId.get(ACE_LEGEND),warped=state.db.byId.get(ACE_WARPED);
  assert.strictEqual(P._test.introducesLineageConflict(state,[legend],[warped]),false,'normal consume-and-upgrade was treated as coexistence');
  assert.strictEqual(P._test.introducesLineageConflict(state,[warped],[warped,legend]),true,'ancestor was rebuilt next to its warped descendant');
  assert.strictEqual(P._test.lineupMaterialOverlap(state,[warped,legend]).lineagePairs,1);
});

test('an automatic final plan never keeps an ancestor beside its warped descendant',()=>{
  const state=abundantState(),result=P.planFinalSquad({state,settings:settings('physical',false)}),lineup=result.finalLineup.map(row=>row.unit);
  assert.strictEqual(result.targetBoardCount,7);
  assert.strictEqual(result.finalLineup.length,7);
  assert.strictEqual(result.plannedCount,9);
  assert.strictEqual(result.materialOverlap.lineagePairs,0,JSON.stringify(result.materialOverlap.pairs));
  assert(!result.finalLineup.some(row=>row.id===ACE_LEGEND)||!result.finalLineup.some(row=>row.id===ACE_WARPED),'Ace legend and warped Ace coexisted');
  for(let left=0;left<lineup.length;left++)for(let right=left+1;right<lineup.length;right++)assert.strictEqual(P._test.pairMaterialOverlap(state,lineup[left],lineup[right]).lineage,false,`${lineup[left].id}/${lineup[right].id}`);
});

test('the sidebar has no warped switch and documents the always-on rule',()=>{
  const source=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(!source.includes('data-act="recommend-warped"'));
  assert(!source.includes('왜곡 경로 제외'));
  assert(source.includes('왜곡 경로 항상 허용'));
  assert(!source.includes("settings.recommendWarped?'warped-on':'warped-off'"),'removed switch still changes watch stability');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();passed++;console.log('PASS',name);}
  catch(error){console.error('FAIL',name);throw error;}
}
console.log(`Warped always-on/material-overlap v14.0.0 tests: ${passed}/${tests.length} passed`);
