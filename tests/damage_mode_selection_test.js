'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_app.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const App=global.ORDApp.App;
const T=global.ORDApp._test;
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}

function row(id,name,pass=true){return{upperId:id,upperCanonicalId:id,upperName:name,directionKey:'',projectedComplete:true,safePrefix:{checkpointPass:pass,checkpoint:{key:'r30',dueRound:30},actions:[{id,name,wispCost:1}]}};}
const rawBoard={
  lanes:[
    {key:'physical',mode:'physical',label:'물딜 1상위',rows:[row('p','물딜 상위')]},
    {key:'dual',mode:'magic',label:'마딜 2상위',rows:[row('m','마딜 상위')]},
    {key:'singleEnd',mode:'magic',label:'마딜 1상위',rows:[row('m','마딜 상위')]}
  ],
  dominant:'',provisionalDirection:null,safeReroll:[]
};

check('자동/물딜/마딜 선택이 방향 레인을 실제로 제한한다',()=>{
  assert.deepStrictEqual(T.directionBoardForMode(rawBoard,'').lanes.map(lane=>lane.key),['physical','dual','singleEnd']);
  const physical=T.directionBoardForMode(rawBoard,'physical');
  assert.deepStrictEqual(physical.lanes.map(lane=>lane.key),['physical']);
  assert.strictEqual(physical.modeFilter,'physical');
  assert.deepStrictEqual(physical.provisionalDirection.routeKeys,['physical']);
  const magic=T.directionBoardForMode(rawBoard,'magic');
  assert.deepStrictEqual(magic.lanes.map(lane=>lane.key),['dual','singleEnd']);
  assert.strictEqual(magic.modeFilter,'magic');
  assert.deepStrictEqual(magic.provisionalDirection.routeKeys,['dual','singleEnd']);
});

check('반대 계통 선택은 모순된 확정 상위와 청사진을 해제한다',()=>{
  const app=Object.create(App.prototype),messages=[];
  app.catalog=global.ORD_TMO_UNITS;
  app.state=Object.assign(T.normalizeInitialState({mode:'physical'}),{
    snapshot:{counts:{},currentAbilities:{},at:1},
    locks:[{stage:'upper',id:'190H',source:'manual-route'}],
    upperBlueprint:{upperId:'190H',lineupIds:['190H'],buildOrderIds:['190H'],mode:'physical',magicRoute:'physical',revision:1},
    directionStatus:'selected',directionKey:'physical',directionUpperId:'190H',upperPreviewId:'190H',postLegendRoute:'upper'
  });
  app._squadCacheKey='old';app._upperRankCacheKey='old';app._upperRankCache=[{upperId:'190H'}];app._directionRankCacheKey='old';app._directionDesiredKey='old';
  app.recordAuditAction=payload=>{app.audit=payload;};app.persist=()=>{};app.render=()=>{};app.setMessage=message=>messages.push(message);
  assert.strictEqual(app.selectDamageMode('magic'),true);
  assert.strictEqual(app.state.mode,'magic');
  assert.strictEqual(app.upperLock(),null);
  assert.strictEqual(app.state.upperBlueprint,null);
  assert.deepStrictEqual([app.state.directionStatus,app.state.directionKey,app.state.directionUpperId,app.state.upperPreviewId],['open','','','']);
  assert.strictEqual(app._directionRankCacheKey,'');
  assert.strictEqual(app.audit.conflictingUpperReleased,true);
  assert.match(messages[0],/\(A\)쵸파.*확정을 해제했습니다.*물딜로 돌아오면 원클릭으로 다시 확정/);
  // v19.2(사용자 요청): "물딜 가려다가 마딜로 바꿔서" — 해제된 상위를
  // 기억해 뒀다가 원래 계통으로 돌아오면 원클릭 복구를 제안해야 한다.
  assert.deepStrictEqual(
    {id:app.state.releasedUpperHint.id,mode:app.state.releasedUpperHint.mode,routeKey:app.state.releasedUpperHint.routeKey},
    {id:'190H',mode:'physical',routeKey:'physical'}
  );
});

check('원클릭 복구는 계통이 같을 때만 성립하고, 되돌아오면 상위를 되살린다',()=>{
  const app=Object.create(App.prototype);
  app.catalog=global.ORD_TMO_UNITS;
  app.state=Object.assign(T.normalizeInitialState({mode:'physical'}),{
    snapshot:{counts:{},currentAbilities:{},at:1},
    locks:[{stage:'upper',id:'190H',source:'manual-route'}]
  });
  app._squadCacheKey='old';app.recordAuditAction=()=>{};app.persist=()=>{};app.render=()=>{};app.setMessage=()=>{};
  app.selectDamageMode('magic');
  // 아직 마딜인 동안은 복구 대상이 없다 — 힌트의 계통(물딜)과 다르다.
  assert.strictEqual(app.activeReleasedUpperHint(),null,'계통이 다른데 복구 후보가 잡힘');
  app.selectDamageMode('physical');
  const active=app.activeReleasedUpperHint();
  assert(active,'물딜로 돌아왔는데 복구 후보가 없음');
  assert.strictEqual(active.unit.id,'190H');
  app.act('restore-released-upper',{dataset:{}});
  assert.strictEqual(app.upperLock()&&app.upperLock().id,'190H','원클릭 복구가 상위를 되살리지 못함');
  assert.strictEqual(app.state.releasedUpperHint,null,'복구 후 힌트가 남아 있음 — 다음에 또 뜬다');
});

check('복구 힌트는 창을 넘기면 만료된다',()=>{
  const app=Object.create(App.prototype);
  app.catalog=global.ORD_TMO_UNITS;
  app.state=Object.assign(T.normalizeInitialState({mode:'physical',currentRound:50}),{
    snapshot:{counts:{},currentAbilities:{},at:1},
    locks:[{stage:'upper',id:'190H',source:'manual-route'}]
  });
  app.recordAuditAction=()=>{};app.persist=()=>{};app.render=()=>{};app.setMessage=()=>{};
  app.selectDamageMode('magic');
  app.state.currentRound=app.state.releasedUpperHint.releasedRound+16;
  app.selectDamageMode('physical');
  assert.strictEqual(app.activeReleasedUpperHint(),null,'라운드 창을 넘긴 힌트가 여전히 살아 있음');
});

check('이미 선택된 같은 계통 버튼은 확정 경로를 건드리지 않는다',()=>{
  const app=Object.create(App.prototype);
  app.catalog=global.ORD_TMO_UNITS;app.state=Object.assign(T.normalizeInitialState({mode:'physical',modeExplicit:true,settingsRevision:177}),{snapshot:{counts:{},at:1},locks:[{stage:'upper',id:'190H'}],directionStatus:'selected',directionKey:'physical',directionUpperId:'190H'});
  assert.strictEqual(app.selectDamageMode('physical'),false);
  assert.strictEqual(app.upperLock().id,'190H');
  assert.strictEqual(app.state.directionStatus,'selected');
});

check('방향판에 즉시 보이는 계통 버튼 세 개가 있다',()=>{
  const app=Object.create(App.prototype);app.state={mode:'magic',directionStatus:'open',directionKey:'',directionUpperId:'',currentRound:25,roundStartedAt:0,roundPrepSeconds:10,roundNormalSeconds:35,roundBossSeconds:60};
  const html=app.renderDirectionBoard({}, {directionBoard:Object.assign({},T.directionBoardForMode(rawBoard,'magic'),{lanes:[]})});
  for(const [value,label] of [['','자동 비교'],['physical','물딜'],['magic','마딜']])assert(html.includes(`data-act="mode" data-value="${value}">${label}</button>`));
  assert(html.includes('class="on" data-act="mode" data-value="magic"'));
});

check('1번 패널이 방향 선택 화면에서 원클릭 복구 카드를 클릭 없이 보여준다',()=>{
  const app=Object.create(App.prototype);
  app.catalog=global.ORD_TMO_UNITS;
  app.state=Object.assign(T.normalizeInitialState({mode:'physical',modeExplicit:true}),{
    mode:'physical',currentRound:45,
    snapshot:{counts:{},currentAbilities:{},at:1},locks:[],
    releasedUpperHint:{id:'190H',mode:'physical',routeKey:'physical',releasedAt:Date.now(),releasedRound:44}
  });
  app.v153Icon=()=>'';app.v151ActionFacts=()=>'';
  const decision={state:'ROUTE_CHOICE',label:'메인 상위 방향 선택',reason:'테스트',routeCandidates:[],coachAction:null,confidence:null};
  const plan={v15Decision:decision};
  const state={db:C.buildDb(global.ORD_TMO_UNITS),counts:{}};
  const html=App.prototype.renderV151NextAction.call(app,state,plan,{ready:true,label:'',note:''});
  assert(html.includes('v151-route-restore'), 'ROUTE_CHOICE 화면에 복구 카드가 없음 — 눌러야만 보이는 상태로 되돌아간 것');
  assert(html.includes('data-act="restore-released-upper"'), '복구 버튼이 없음');
  assert(html.includes('쵸파'), '해제된 상위 이름이 카드에 없음');
  // 계통이 다르면(해제 당시와 지금이 다르면) 카드가 사라져야 한다.
  app.state.mode='magic';
  const htmlMagic=App.prototype.renderV151NextAction.call(app,state,plan,{ready:true,label:'',note:''});
  assert(!htmlMagic.includes('v151-route-restore'), '계통이 다른데도 복구 카드가 남아 있음');
});

console.log(`\n${checks}/${checks} damage mode selection checks passed.`);
