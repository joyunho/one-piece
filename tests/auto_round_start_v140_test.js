'use strict';

const assert=require('assert');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;

for(const file of [
  'ord_units_data.js',
  'ord_upper_memo.js',
  'ord_synergy_memo.js',
  'ord_data_patch.js',
  'ord_story_nonupper_data.js',
  'ord_story_upper_data.js',
  'ord_core.js',
  'ord_squad_planner.js',
  'ord_app.js'
])require(path.join(EXT,file));

const C=global.ORDCore;
const App=global.ORDApp.App;
const T=global.ORDApp._test;
const catalog=global.ORD_TMO_UNITS;

function fixture(){
  const app=Object.create(App.prototype);
  app.catalog=catalog;
  app.config={source:'extension'};
  app.state=T.normalizeInitialState({
    currentRound:1,
    roundStartedAt:0,
    roundPrepSeconds:10,
    roundNormalSeconds:35,
    roundBossSeconds:60,
    roundAutoGeneration:0,
    roundAutoSourceEpoch:0
  });
  app.state.snapshot=null;
  app.state.liveAt=0;
  app.root={
    contains:()=>false,
    querySelectorAll:()=>[]
  };
  app.persistCalls=0;
  app.renderCalls=0;
  app.messages=[];
  app.persist=()=>{app.persistCalls++;};
  app.render=()=>{app.renderCalls++;};
  app.updateLiveStatusOnly=()=>{};
  app.health=()=>({ready:false,key:'waiting'});
  app.prunePending=()=>false;
  app.setMessage=message=>{app.messages.push(message);app.state.message=message;};
  return app;
}

function snapshot(at,generation,startedAt=at){
  return{
    at,
    scanAt:at,
    bridgeAt:at,
    dataChangedAt:at,
    dataHash:`auto-round-${generation}-${at}`,
    sourceEpoch:41,
    counts:{},
    units:[],
    currentAbilities:{},
    autoRound:{
      active:true,
      sourceEpoch:41,
      generation,
      startedAt,
      playableUnitCount:1,
      playableNonzero:1
    }
  };
}

const realNow=Date.now;
let now=1_900_000_000_000;
Date.now=()=>now;

try{
  const app=fixture();

  // The first playable TMO unit creates generation 1. The app backdates the
  // timer by the preparation duration so the visible clock starts at 1라,
  // never at the old 준비 screen.
  app.updateSnapshot(snapshot(now,1));
  const firstStartedAt=now-10_000;
  assert.strictEqual(app.state.roundAutoSourceEpoch,41);
  assert.strictEqual(app.state.roundAutoGeneration,1);
  assert.strictEqual(app.state.roundStartedAt,firstStartedAt);
  assert.strictEqual(app.state.currentRound,1);

  let clock=C.roundClock(app.settings(),now);
  assert.strictEqual(clock.running,true);
  assert.strictEqual(clock.prep,false);
  assert.strictEqual(clock.round,1);
  assert.strictEqual(clock.label,'1라');
  assert.strictEqual(app.actualRound(),1);

  // A later bridge update may carry a newer startedAt value, but the same
  // source/generation is already consumed and must not restart the clock.
  now+=1_000;
  app.updateSnapshot(snapshot(now,1,now));
  assert.strictEqual(app.state.roundStartedAt,firstStartedAt);
  assert.strictEqual(app.messages.filter(message=>message.includes('자동 시작')).length,1);

  // User intent wins after pausing: heartbeats/data changes from the same
  // active generation cannot silently turn the timer back on.
  app.act('round-pause',{dataset:{}});
  assert.strictEqual(app.state.currentRound,1);
  assert.strictEqual(app.state.roundStartedAt,0);

  now+=1_000;
  app.updateSnapshot(snapshot(now,1,now));
  assert.strictEqual(app.state.roundAutoGeneration,1);
  assert.strictEqual(app.state.roundStartedAt,0);
  assert.strictEqual(app.messages.filter(message=>message.includes('자동 시작')).length,1);

  clock=C.roundClock(app.settings(),now);
  assert.strictEqual(clock.running,false);
  assert.strictEqual(clock.round,1);
  assert.strictEqual(clock.label,'1라 · 수동');

  console.log('PASS  new active auto-round generation starts exactly once at 1라');
  console.log('PASS  manual pause survives later snapshots from the same generation');
}finally{
  Date.now=realNow;
}
