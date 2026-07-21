'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const workerSource=fs.readFileSync(path.join(EXT,'ord_direction_worker.js'),'utf8');
const appSource=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
const bootSource=fs.readFileSync(path.join(EXT,'ord_boot_extension.js'),'utf8');
let checks=0;

function check(name,fn){
  fn();
  checks++;
  console.log(`PASS  ${name}`);
}

function workerHarness(){
  const imports=[];
  const messages=[];
  const calls=[];
  const context={console};
  context.self=context;
  context.importScripts=(...files)=>imports.push(...files);
  context.postMessage=message=>messages.push(message);
  context.ORD_TMO_UNITS=[{id:'fixture-upper'}];
  context.ORDSquadPlanner={
    rankDeckDirections(input,options){
      calls.push({input,options});
      const safePrefix={
        basis:'current-tmo-stock-only',guaranteed:true,mode:'physical',route:'physical',
        checkpointPass:true,rankVector:[0,0,0,0],requirementPriority:[0,0,1],
        rareRemaining:2,wispUsed:1,tierUse:{rare:4,special:5,uncommon:6,common:40},
        commonPressure:3,storyProxy:72,actionCount:1,
        checkpoint:{key:'r30',dueRound:30,equivalent:4},
        actions:[{order:1,id:'fixture-upper',name:'상위',wispCost:1,remainingWisp:0,reason:'상위 딜러 충족',roles:'상위',spend:{rare:4},privateActionField:'must be removed'}],
        blockers:[],note:'현재 패로 제작 검증',privateSafePrefixField:'must be removed'
      };
      return{
        version:'14.0.0',dominant:'physical',decision:'ready',reason:'fixture',
        safeReroll:[{id:'rare-a',name:'fixture rare'}],evaluatedCandidates:3,availableCandidates:2,elapsedMs:17,
        provisionalDirection:{upperId:'fixture-upper',upperCanonicalId:'fixture-upper',upperName:'상위',routeKeys:['physical'],checkpoint:{key:'r30',dueRound:30,equivalent:4},actions:[{id:'fixture-upper',name:'상위',wispCost:1}]},
        privateBoardField:'must be removed',
        lanes:[{
          key:'physical',mode:'physical',route:'physical',label:'물딜',priority:['상위'],privateLaneField:'must be removed',
          rows:[{
            rank:1,upperId:'fixture-upper',upperCanonicalId:'fixture-upper',upperName:'상위',mode:'physical',
            completion:91,rareUsed:6,rareTotal:6,roleComplete:true,clearComplete:true,fullyBuildable:true,
            directionKey:'physical',upperIds:['fixture-upper'],upperNames:['상위'],exactVerified:true,
            safePrefix,
            privateRowField:'must be removed',
            routeEvaluation:{route:'physical',confirmable:true,privateEvaluationField:'must be removed'},
            blueprint:{version:'14.0.0',revision:1,upperId:'fixture-upper',lineupIds:['fixture-upper'],buildOrderIds:['fixture-upper'],mode:'physical',magicRoute:'physical',privateBlueprintField:'must be removed'},
            plan:{
              version:'14.0.0',mode:'physical',targetCount:9,projectedCount:9,complete:true,privatePlanField:'must be removed',
              finalLineup:[{id:'fixture-upper',status:'owned',unit:{id:'fixture-upper',privateUnitField:'must be removed'}}],
              roleCoverage:{planned:{complete:true,readiness:100,privateRoleField:'must be removed'}},
              handFit:{feasible:true,tiers:{rare:{initial:6}},futurePending:[{id:'rare-a',name:'희귀',tier:'rare',count:1,privateMaterialField:'must be removed'}]},
              wispBudget:{available:2,required:0,withinBudget:true,fullPartyFeasible:true,privateWispField:'must be removed'},
              routeEvaluation:{route:'physical',confirmable:true,finish:{status:'stable',stable:4,privateFinishField:'must be removed'}},
              safePrefix
            }
          }]
        }]
      };
    }
  };
  vm.createContext(context);
  vm.runInContext(workerSource,context,{filename:'ord_direction_worker.js'});
  return{context,imports,messages,calls};
}

check('extension boot gives direction ranking its own classic Worker URL',()=>{
  assert(/directionWorkerUrl:\s*chrome\.runtime\.getURL\(['"]ord_direction_worker\.js['"]\)/.test(bootSource));
  assert(workerSource.startsWith("'use strict';\nself.window=self;\nimportScripts("));
});

check('worker loads every planner dependency and ranks only two candidates per lane',()=>{
  const harness=workerHarness();
  assert.deepStrictEqual(harness.imports,[
    'ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js',
    'ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js'
  ]);
  harness.context.onmessage({data:{type:'rank-directions',requestId:7,key:'hand-a',payload:{snapshot:{counts:{a:1}},settings:{mode:'physical'}}}});
  assert.strictEqual(harness.calls.length,1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(harness.calls[0].options)),{perLane:2,candidateCap:8});
  assert.deepStrictEqual(Array.from(harness.calls[0].input.locks),[]);
  assert.strictEqual(harness.messages.length,1);
  assert.strictEqual(harness.messages[0].type,'rank-directions-result');
  assert.strictEqual(harness.messages[0].requestId,7);
  assert.strictEqual(harness.messages[0].key,'hand-a');
});

check('worker returns a compact UI-only board and reports calculation errors',()=>{
  const harness=workerHarness();
  harness.context.onmessage({data:{type:'rank-directions',requestId:8,key:'hand-b',payload:{}}});
  const result=harness.messages[0];
  const serialized=JSON.stringify(result.board);
  for(const forbidden of ['privateBoardField','privateLaneField','privateRowField','privatePlanField','privateUnitField','privateRoleField','privateMaterialField','privateWispField','privateEvaluationField','privateFinishField','privateBlueprintField','privateSafePrefixField','privateActionField','spend']){
    assert(!serialized.includes(forbidden),`worker response leaked ${forbidden}`);
  }
  const row=result.board.lanes[0].rows[0];
  assert.strictEqual(row.plan.finalLineup[0].unit.id,'fixture-upper');
  assert.strictEqual(row.plan.handFit.tiers.rare.initial,6);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.board.provisionalDirection)),{
    upperId:'fixture-upper',upperCanonicalId:'fixture-upper',upperName:'상위',routeKeys:['physical'],
    checkpoint:{key:'r30',dueRound:30,equivalent:4},actions:[{id:'fixture-upper',name:'상위',wispCost:1}]
  });
  const expectedPrefix={
    basis:'current-tmo-stock-only',guaranteed:true,mode:'physical',route:'physical',checkpointPass:true,
    rankVector:[0,0,0,0],requirementPriority:[0,0,1],rareRemaining:2,wispUsed:1,
    tierUse:{rare:4,special:5,uncommon:6,common:40},commonPressure:3,storyProxy:72,actionCount:1,
    blockers:[],note:'현재 패로 제작 검증',checkpoint:{key:'r30',dueRound:30,equivalent:4},
    actions:[{order:1,id:'fixture-upper',name:'상위',wispCost:1,remainingWisp:0,reason:'상위 딜러 충족',roles:'상위'}]
  };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(row.safePrefix)),expectedPrefix,'row safePrefix was lost or expanded by worker compaction');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(row.prefixActions)),expectedPrefix.actions,'compact prefixActions did not mirror safePrefix actions');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(row.plan.safePrefix)),expectedPrefix,'plan safePrefix was lost by worker compaction');
  harness.context.ORDSquadPlanner.rankDeckDirections=()=>{throw new Error('fixture worker failure');};
  harness.context.onmessage({data:{type:'rank-directions',requestId:9,key:'hand-c',payload:{}}});
  assert.strictEqual(harness.messages[1].type,'rank-directions-error');
  assert.strictEqual(harness.messages[1].requestId,9);
  assert(harness.messages[1].error.includes('fixture worker failure'));
});

check('App.plan queues direction work and never invokes the full ranker synchronously',()=>{
  const start=appSource.indexOf('  plan(){');
  const end=appSource.indexOf('\n  health(){',start);
  assert(start>=0&&end>start,'App.plan method boundary not found');
  const body=appSource.slice(start,end);
  assert(body.includes('this.queueDirectionRank(rankKey,settings)'),'App.plan does not enqueue direction ranking');
  assert(body.includes('{loading:true,lanes:[],safeReroll:[]'),'loading placeholder is missing');
  assert(!/\brankDeckDirections\s*\(/.test(body),'App.plan still performs direction ranking on the main thread');
});

(async()=>{
  global.window=global;
  global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
  for(const file of [
    'ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js',
    'ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_app.js'
  ])require(path.join(EXT,file));

  const App=global.ORDApp.App;
  const realWorker=global.Worker;
  const realRank=global.ORDSquadPlanner.rankDeckDirections;
  const workers=[];
  let mainThreadRanks=0;
  class FakeWorker{
    constructor(url){this.url=url;this.messages=[];this.terminated=false;workers.push(this);}
    postMessage(message){this.messages.push(message);}
    terminate(){this.terminated=true;}
  }
  global.Worker=FakeWorker;
  global.ORDSquadPlanner.rankDeckDirections=()=>{mainThreadRanks++;throw new Error('must not run on main thread');};

  const app=Object.create(App.prototype);
  Object.assign(app,{
    catalog:global.ORD_TMO_UNITS,
    config:{source:'extension',directionWorkerUrl:'chrome-extension://fixture/ord_direction_worker.js'},
    state:{snapshot:{counts:{rare:2},currentAbilities:{attack:1},units:[{id:'rare',name:'희귀',groupName:'희귀함',count:2,percent:61,tmoPercent:61,abilities:{},privateField:'drop me'}]}},
    _directionDesiredKey:'',_directionRankSeq:0,_directionRankTimer:0,_directionWorker:null,_directionInFlight:null,
    _directionWorkerDisabled:false,_directionRankCacheKey:'',_directionRankCache:null,_deferredExternalRender:false,
    renderCalls:0,
    render(){this.renderCalls++;},
    shouldDeferExternalRender(){return false;}
  });

  try{
    app.queueDirectionRank('hand-live',{mode:'physical',upperPreviewId:'old-preview',preferredLineupIds:['old-upper']});
    await new Promise(resolve=>setTimeout(resolve,230));
    assert.strictEqual(mainThreadRanks,0,'direction ranker ran on the UI thread');
    assert.strictEqual(workers.length,1);
    assert.strictEqual(workers[0].url,'chrome-extension://fixture/ord_direction_worker.js');
    assert.strictEqual(workers[0].messages.length,1);
    const request=workers[0].messages[0];
    assert.strictEqual(request.type,'rank-directions');
    assert.strictEqual(request.key,'hand-live');
    assert.deepStrictEqual(request.payload.options,{perLane:2,candidateCap:8});
    assert.strictEqual(request.payload.settings.upperPreviewId,'');
    assert.deepStrictEqual(request.payload.settings.preferredLineupIds,[]);
    assert.strictEqual(request.payload.snapshot.units[0].privateField,undefined);

    workers[0].onmessage({data:{type:'rank-directions-result',requestId:request.requestId,key:request.key,board:{lanes:[],safeReroll:[],decision:'hold'}}});
    assert.strictEqual(app._directionRankCacheKey,'hand-live');
    assert.strictEqual(app._directionRankCache.decision,'hold');
    assert.strictEqual(app.renderCalls,1);

    app.acceptDirectionRank({type:'rank-directions-result',requestId:request.requestId-1,key:'stale-hand',board:{decision:'wrong'}});
    assert.strictEqual(app._directionRankCache.decision,'hold','stale worker response replaced the current board');
    assert.strictEqual(app.renderCalls,1,'stale worker response triggered a render');
    checks++;
    console.log('PASS  debounced App queue posts compact data, accepts current result, and ignores stale result');
  }finally{
    clearTimeout(app._directionRankTimer);
    app.stopDirectionWorker();
    global.Worker=realWorker;
    global.ORDSquadPlanner.rankDeckDirections=realRank;
  }

  console.log(`\n${checks}/${checks} direction worker/async checks passed.`);
})().catch(error=>{
  console.error(error.stack||error);
  process.exit(1);
});
