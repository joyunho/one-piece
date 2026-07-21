'use strict';

const assert=require('assert');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
for(const file of [
  'ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js',
  'ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_app.js'
])require(path.join(EXT,file));

const App=global.ORDApp.App;
let checks=0;

function fixture(){
  const app=Object.create(App.prototype);
  app.state={
    directionStatus:'hold',directionKey:'physical',directionUpperId:'upper-a',directionHoldFingerprint:'hand-a',
    manualCounts:{},pendingCounts:{},pendingAt:{},pendingTransaction:null,
    wispOverride:'',virtualSpecialId:'',upperRankCacheKey:'',locks:[],upperBlueprint:null,
    mode:'physical',magicRoute:'auto',gorosei:'none',superKumaOwned:true,currentRound:25,
    roundStartedAt:0,roundPrepSeconds:10,roundNormalSeconds:35,roundBossSeconds:60,
    rerollsUsed:0,transcendUsed:0,seraphUsed:0,changedUsed:0
  };
  app._directionRankCacheKey='ranked-hand-a';
  app._upperRankCacheKey='upper-cache';
  app._upperRankCache=[{upperId:'upper-a'}];
  app._squadCacheKey='squad-cache';
  app._deferredExternalRender=true;
  app.persistCalls=0;
  app.renderCalls=0;
  app.persist=()=>{app.persistCalls++;};
  app.render=()=>{app.renderCalls++;};
  app.normalized=()=>({counts:{'unit-a':2}});
  return app;
}

function assertReopened(app,label){
  assert.strictEqual(app.state.directionStatus,'open',`${label}: hold was not released`);
  assert.strictEqual(app.state.directionKey,'',`${label}: selected direction remains`);
  assert.strictEqual(app.state.directionUpperId,'',`${label}: selected upper remains`);
  assert.strictEqual(app.state.directionHoldFingerprint,'',`${label}: hold fingerprint remains`);
  assert.strictEqual(app._directionRankCacheKey,'',`${label}: stale direction cache key remains`);
  assert.strictEqual(app.persistCalls,1,`${label}: state was not persisted once`);
  assert.strictEqual(app.renderCalls,1,`${label}: UI was not rendered once`);
}

{
  const app=fixture();
  app.act('unit-adjust',{dataset:{id:'unit-a',delta:'1'}});
  assert.strictEqual(app.state.manualCounts['unit-a'],3);
  assertReopened(app,'manual unit adjustment');
  checks++;
  console.log('PASS  held direction reopens after a manual unit-count mutation');
}

{
  const app=fixture();
  app.setOpt('virtualSpecialId','B00h');
  assert.strictEqual(app.state.virtualSpecialId,'B00h');
  assert.deepStrictEqual(app._upperRankCache,[],'virtual Special change must invalidate upper candidates');
  assertReopened(app,'virtual Special selection');
  checks++;
  console.log('PASS  held direction reopens after selecting the 152-kill virtual Special');
}

{
  const app=fixture();
  app.setOpt('wispOverride','7');
  assert.strictEqual(app.state.wispOverride,'7');
  assertReopened(app,'selection-wisp override');
  checks++;
  console.log('PASS  held direction reopens after changing the selection-wisp override');
}

{
  const app=fixture();
  app.state.manualCounts={'unit-a':4};
  app.act('clear-unit-override',{dataset:{id:'unit-a'}});
  assert.strictEqual(Object.prototype.hasOwnProperty.call(app.state.manualCounts,'unit-a'),false);
  assertReopened(app,'single unit override clear');
  checks++;
  console.log('PASS  held direction reopens after clearing one unit override');
}

{
  const app=fixture();
  app.state.manualCounts={'unit-a':4};
  app.state.pendingCounts={'unit-a':3};
  app.state.pendingAt={'unit-a':123};
  app.state.wispOverride='8';
  app.act('clear-overrides',{dataset:{}});
  assert.deepStrictEqual(app.state.manualCounts,{});
  assert.deepStrictEqual(app.state.pendingCounts,{});
  assert.deepStrictEqual(app.state.pendingAt,{});
  assert.strictEqual(app.state.wispOverride,'');
  assertReopened(app,'all overrides clear');
  checks++;
  console.log('PASS  held direction reopens after clearing all overrides');
}

console.log(`\n${checks}/${checks} direction-hold release checks passed.`);
