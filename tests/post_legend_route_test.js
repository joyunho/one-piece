'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

const memory=new Map();
global.window=global;
global.localStorage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_app.js'])require(path.join(EXT,file));

const C=global.ORDCore,App=global.ORDApp.App,T=global.ORDApp._test,catalog=global.ORD_TMO_UNITS,db=C.buildDb(catalog);
const legends=db.legendish.filter(unit=>/^전설|^히든/.test(C.groupName(unit))),first=legends[0],second=legends[1],third=legends[2];
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}
function stateFor(route='',counts={[first.id]:1},units=[]){
  const app=Object.create(App.prototype),base=T.normalizeInitialState({mode:'physical',currentRound:21,postLegendRoute:route,postLegendBaseline:route==='legend'?{[first.id]:1}:{}});
  app.catalog=catalog;app.config={source:'standalone-manual'};app.state=Object.assign({},base,{snapshot:{dataHash:'post-legend-hand',at:Date.now(),counts:Object.assign({[C.WISP_ID]:20},counts),units,currentAbilities:{}},manualCounts:{},pendingCounts:{},pendingAt:{},pendingTransaction:null,locks:[],upperBlueprint:null,upperDetection:{},watchStability:{},upperPreviewId:'',purpose:'',roundStartedAt:0,currentRound:21});
  app._squadCacheKey='';app._squadCache=null;app._upperRankCacheKey='';app._upperRankCache=[];app.persist=()=>{};app.render=()=>{};app.toast=message=>{app.lastToast=message;};app.setMessage=message=>{app.lastMessage=message;};return app;
}

check('route and per-unit baseline survive normalization, settings and persistence',()=>{
  const normalized=T.normalizeInitialState({postLegendRoute:'legend',postLegendBaseline:{[first.id]:2}});
  assert.strictEqual(normalized.postLegendRoute,'legend');assert.strictEqual(normalized.postLegendBaseline[first.id],2);
  const app=stateFor('legend');assert.strictEqual(app.settings().postLegendRoute,'legend');App.prototype.persist.call(app);
  const saved=JSON.parse(memory.get('ord-nightmare-squad-architect-v13'));assert.strictEqual(saved.postLegendRoute,'legend');assert.deepStrictEqual(saved.postLegendBaseline,{[first.id]:1});
});

check('first completed Legend pauses recommendation until the user chooses a branch',()=>{
  const app=stateFor(''),pack=app.plan();assert(pack.plan.postLegendDecision.awaiting);assert(!pack.plan.upperBlueprintRanked);
  const html=app.renderPostLegendChoice(pack.plan.postLegendDecision);assert(html.includes('첫 전설·히든 완성 · 다음 진행을 선택하세요'));assert(html.includes('전설·히든 하나 더'));assert(html.includes('상위 준비'));
});

check('Legend branch ranks extra candidates by live TMO completion and keeps an Upper switch visible',()=>{
  const app=stateFor('legend',{[first.id]:1},[{id:second.id,tmoPercent:61},{id:third.id,tmoPercent:88}]),pack=app.plan();
  assert.strictEqual(pack.plan.purpose,'story');assert(pack.plan.extraLegendChoice);assert(pack.plan.actions.length>1);assert(pack.plan.actions[0].progress>=pack.plan.actions[1].progress);
  const html=app.renderPostLegendChoice(pack.plan.postLegendDecision);assert(html.includes('TMO 완성도순, 완성 후 다시 선택'));assert(html.includes('상위 3기분을 반영한 전설 환산 9기 미리보기'));
});

check('route switches clear only the conflicting pending choice',()=>{
  const app=stateFor('legend');app.state.locks=[{stage:'legend',id:second.id},{stage:'rare',id:'rare'}];app.act('post-legend-route',{dataset:{value:'upper'}});
  assert.strictEqual(app.state.postLegendRoute,'upper');assert(!app.state.locks.some(lock=>lock.stage==='legend'));assert(app.state.locks.some(lock=>lock.stage==='rare'));
  app.state.upperPreviewId='preview-upper';app.act('post-legend-route',{dataset:{value:'legend'}});assert.strictEqual(app.state.postLegendRoute,'legend');assert.strictEqual(app.state.upperPreviewId,'');
});

check('pending build transaction disables and guards branch changes without rollback',()=>{
  const app=stateFor('');app.state.pendingTransaction={at:1,lastAt:1,baseFingerprint:'x',baseDataChangedAt:0,source:{},rollback:app.transactionRollbackSnapshot(),expected:{[second.id]:1},status:'pending',steps:[{id:second.id,name:'test'}]};
  const html=app.renderPostLegendChoice(app.postLegendDecision(app.normalized()));assert(html.includes('TMO 제작 반영 확인 후 다음 경로 선택'));assert(html.includes(' disabled aria-disabled="true"'));
  const tx=app.state.pendingTransaction;app.act('post-legend-route',{dataset:{value:'upper'}});assert.strictEqual(app.state.postLegendRoute,'');assert.strictEqual(app.state.pendingTransaction,tx);assert(app.lastToast.includes('TMO 제작 반영 확인 후'));
});

check('mark-made for one extra Legend reopens the branch immediately in standalone mode',()=>{
  const app=stateFor('legend'),pack={state:app.normalized()},row={unit:second,solve:{consumed:{},wispCost:0}};app.markBuild(row,pack);
  assert.strictEqual(app.state.postLegendRoute,'');assert.strictEqual(app.state.pendingTransaction,null);assert.strictEqual(app.state.manualCounts[second.id],1);
  assert(app.renderPostLegendChoice(app.postLegendDecision(app.normalized())).includes('다음 진행을 선택하세요'));
});

check('an exact automatic TMO confirmation clears the transaction and re-enables both routes',()=>{
  const app=stateFor('legend'),pack={state:app.normalized()},row={unit:second,solve:{consumed:{},wispCost:0}};app.config={source:'extension'};app.health=()=>({ready:true,key:'ok'});app.updateLiveStatusOnly=()=>{};app.markBuild(row,pack);
  assert(app.state.pendingTransaction);let html=app.renderPostLegendChoice(app.postLegendDecision(app.normalized()));assert(html.includes(' disabled aria-disabled="true"'));
  app.updateSnapshot({dataHash:'confirmed-extra-legend',dataChangedAt:Date.now()+10,at:Date.now()+10,counts:{[C.WISP_ID]:20,[first.id]:1,[second.id]:1},units:[],currentAbilities:{}});
  assert.strictEqual(app.state.pendingTransaction,null);html=app.renderPostLegendChoice(app.postLegendDecision(app.normalized()));assert(html.includes('다음 진행을 선택하세요'));assert(!html.includes(' disabled aria-disabled="true"'));
});

check('an external per-unit Legend increase reopens the branch and clears its lock',()=>{
  const app=stateFor('legend');app.state.locks=[{stage:'legend',id:second.id}];app.health=()=>({ready:true,key:'ok'});app.updateLiveStatusOnly=()=>{};
  app.updateSnapshot({dataHash:'post-legend-plus-one',at:Date.now()+10,counts:{[C.WISP_ID]:20,[first.id]:1,[second.id]:1},units:[],currentAbilities:{}});
  assert.strictEqual(app.state.postLegendRoute,'');assert(!app.state.locks.some(lock=>lock.stage==='legend'));assert(app.lastMessage.includes('추가 전설·히든 완성'));
});

check('heartbeat-equivalent or decreased counts never complete the one-more-Legend branch',()=>{
  const app=stateFor('legend',{[first.id]:1,[second.id]:1});app.state.postLegendBaseline={[first.id]:1,[second.id]:1};app.health=()=>({ready:true,key:'ok'});app.updateLiveStatusOnly=()=>{};
  app.updateSnapshot({dataHash:'same-counts',at:Date.now()+10,counts:{[C.WISP_ID]:20,[first.id]:1,[second.id]:1},units:[],currentAbilities:{}});assert.strictEqual(app.state.postLegendRoute,'legend');
  app.updateSnapshot({dataHash:'decreased-counts',at:Date.now()+20,counts:{[C.WISP_ID]:20,[first.id]:1},units:[],currentAbilities:{}});assert.strictEqual(app.state.postLegendRoute,'legend');
});

check('transaction rollback restores route and exact baseline',()=>{
  const app=stateFor('legend'),rollback=app.transactionRollbackSnapshot();app.state.postLegendRoute='upper';app.state.postLegendBaseline={};app.restoreTransaction({at:1,expected:{x:1},steps:[{id:'x'}],rollback});
  assert.strictEqual(app.state.postLegendRoute,'legend');assert.deepStrictEqual(app.state.postLegendBaseline,{[first.id]:1});
});

console.log(`\n${checks}/${checks} post-Legend route checks passed.`);
