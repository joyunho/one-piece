'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

const memory=new Map();
global.localStorage={
  getItem:key=>memory.has(key)?memory.get(key):null,
  setItem:(key,value)=>memory.set(key,String(value)),
  removeItem:key=>memory.delete(key)
};
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_app.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const App=global.ORDApp.App;
const T=global.ORDApp._test;
const source=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
const css=fs.readFileSync(path.join(EXT,'ord_app.css'),'utf8');
let checks=0;

function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}

check('direction selection state is persisted and invalid legacy values reopen',()=>{
  const held=T.normalizeInitialState({directionStatus:'hold',directionKey:'dual',directionUpperId:'V80H',directionHoldFingerprint:'hand-a'});
  assert.deepStrictEqual(
    [held.directionStatus,held.directionKey,held.directionUpperId,held.directionHoldFingerprint],
    ['hold','dual','V80H','hand-a']
  );
  const invalid=T.normalizeInitialState({directionStatus:'guessed',directionKey:'auto'});
  assert.deepStrictEqual([invalid.directionStatus,invalid.directionKey],['open','']);
  assert(source.includes("['open','preview','selected','hold'].includes(state.directionStatus)"));
});

check('25라부터 incomplete 방향도 잠그고 보조 조합은 adaptive draft로 둔다',()=>{
  const app=Object.create(App.prototype);
  let renders=0;
  const messages=[];
  app.state=Object.assign(T.normalizeInitialState({}),{
    snapshot:{source:'manual',counts:{},dataHash:'hand-a',at:1000},
    pendingTransaction:null,upperBlueprint:null,purpose:'upper',currentRound:24,roundStartedAt:0
  });
  app._upperRankCache=[
    {upperId:'190H',directionKey:'physical',guaranteedComplete:false,safePrefix:{actions:[{id:'190H'}]}},
    {upperId:'V80H',directionKey:'dual',guaranteedComplete:false,safePrefix:{actions:[]}}
  ];
  app._directionRankCache=null;
  app.persist=()=>{};
  app.render=()=>{renders++;};
  app.toast=message=>{messages.push(message);};

  app.act('preview-direction',{dataset:{id:'190H',key:'physical'}});
  assert.deepStrictEqual(
    [app.state.directionStatus,app.state.directionKey,app.state.directionUpperId,app.state.mode,app.state.magicRoute,app.state.upperPreviewId],
    ['preview','physical','190H','physical','auto','190H']
  );

  app.act('choose-direction',{dataset:{id:'V80H',key:'dual'}});
  assert.match(messages.at(-1),/25라운드부터/);
  assert.strictEqual(app.upperLock(),null);

  app.state.currentRound=25;
  app._directionRankCache={provisionalDirection:{upperId:'V80H',upperCanonicalId:'V80H',upperName:'나미 상위',routeKeys:['dual'],checkpoint:{dueRound:30},actions:[{id:'V80H',name:'나미 상위',wispCost:0}]}};
  app.act('choose-direction',{dataset:{id:'190H',key:'physical'}});
  assert.deepStrictEqual(
    [app.state.directionStatus,app.state.directionKey,app.state.directionUpperId,app.state.mode],
    ['selected','physical','190H','physical'],
    'checkpoint 경고가 사용자의 상위 방향 잠금을 막았습니다.'
  );
  assert.strictEqual(app.upperLock().id,'190H');
  assert.strictEqual(app.upperLock().source,'manual-route');
  assert.strictEqual(app.state.upperBlueprint.fullPartyVerified,false);
  assert.strictEqual(app.state.upperBlueprint.commitment,'upper-route');
  assert.deepStrictEqual(app.state.upperBlueprint.lineupIds,['190H']);
  assert.strictEqual(app.state.purpose,'spec');
  assert.match(messages.at(-1),/30라 전후에는 이 상위를 먼저/);

  app.state.locks=[];app.state.upperBlueprint=null;
  app.act('hold-direction',{dataset:{}});
  assert.strictEqual(app.state.directionStatus,'hold');
  assert.deepStrictEqual([app.state.directionKey,app.state.directionUpperId,app.state.upperPreviewId],['','','']);
  assert.strictEqual(app.state.upperBlueprint,null);
  assert(app.state.directionHoldFingerprint,'보류한 실제 패의 fingerprint를 저장해야 합니다.');
  assert(renders>=2);
  assert(source.includes("this.state.directionStatus==='hold'&&this.state.directionHoldFingerprint!==newFp"),'실제 패가 바뀌면 보류를 자동 해제해야 합니다.');
});

check('renderer shows three independent lanes and explicit actions',()=>{
  const app=Object.create(App.prototype);
  app.state={directionStatus:'selected',directionKey:'physical',directionUpperId:'190H',currentRound:25,roundStartedAt:0,roundPrepSeconds:10,roundNormalSeconds:35,roundBossSeconds:60};
  const initial={rare:{initial:6},special:{initial:8},uncommon:{initial:8},common:{initial:63}};
  const row=(upperId,upperName,status,projectedComplete,finish,options={})=>({
    upperId,upperName,upperNames:[upperName],completion:80,status,statusLabel:status==='hold'?'판정 보류':'현재 패 확정 순서 있음',projectedComplete,
    rareRemaining:1,wispCost:1,missing:projectedComplete?[]:['필수 역할 +1'],futureDependencyCount:C.num(options.futureDependencyCount),
    guaranteedComplete:options.guaranteedComplete===true,provisionalSelectable:options.provisionalSelectable===true,
    handFeasible:options.handFeasible!==false,wispShortage:C.num(options.wispShortage),
    upperCanonicalId:options.upperCanonicalId||upperId,
    safePrefix:{actions:options.prefixActions||[],tierUse:{rare:2,special:3,uncommon:4,common:12},wispUsed:1,rareRemaining:4,checkpointPass:options.checkpointPass===true},
    prefixActions:options.prefixActions||[],upperPreparation:{label:options.prefixActions&&options.prefixActions.length?'상위 즉시 제작 가능':'상위 재료 부족'},
    unusedRare:upperId==='190H'?[{id:'C20h',name:'우솝(희귀)',count:1}]:[],
    routeEvaluation:{note:projectedComplete?'정적 역할 기준을 충족했습니다.':'핵심 스펙이 부족합니다.',finish},
    plan:{plannedBoardCount:7,targetBoardCount:7,plannedCount:9,handFit:{tiers:initial}}
  });
  const plan={directionBoard:{
    dominant:'physical',safeReroll:[{id:'Z10h',name:'전역 교집합은 표시하지 않음',count:1}],
    provisionalDirection:{upperId:'190H',upperCanonicalId:'190H',upperName:'쵸파 상위',routeKeys:['physical'],checkpoint:{key:'r30',dueRound:30,equivalent:4},actions:[{id:'190H',name:'쵸파 상위',wispCost:1},{id:'930h',name:'시키',wispCost:0}]},
    lanes:[
      {key:'physical',label:'물딜 1상위',priority:'물딜 우선순위',rows:[row('190H','쵸파 상위','prefix',true,null,{provisionalSelectable:true,checkpointPass:true,futureDependencyCount:3,wispShortage:5,prefixActions:[{id:'190H',name:'쵸파 상위',wispCost:1}]})]},
      {key:'dual',label:'마딜 2상위·토키',priority:'2상위 우선순위',rows:[row('V80H','나미 상위','hold',false)]},
      {key:'singleEnd',label:'마딜 1상위·단끝',priority:'단끝 우선순위',rows:[row('unit_1747756917990_920','쵸파 상위 활성형','control',true,{stable:2,expected:3,maximum:3},{upperCanonicalId:'190H',guaranteedComplete:true,prefixActions:[{id:'unit_1747756917990_920',name:'쵸파 상위 활성형',wispCost:0}]})]}
    ]
  }};
  const html=app.renderDirectionBoard({},plan);

  assert.strictEqual((html.match(/class="direction-lane /g)||[]).length,3);
  for(const label of ['물딜 1상위','마딜 2상위·토키','마딜 1상위·단끝','독립 경로 · 전역 순위 없음'])assert(html.includes(label),`missing direction label: ${label}`);
  for(const key of ['physical','dual','singleEnd']){
    assert(html.includes(`data-act="preview-direction" data-key="${key}"`),`${key} preview action missing`);
    assert(html.includes(`data-act="choose-direction" data-key="${key}"`),`${key} choose action missing`);
  }
  assert(html.includes('data-act="hold-direction"'));
  assert(html.includes('안정 하한 2 · 일반 3 · 이론 3'));
  assert(html.includes('메인 상위는 보조 3~4기 계산에서 제외'));
  assert(html.includes('미래 랜덤 드랍은 보유 자원으로 계산하지 않습니다.'));
  assert(html.indexOf('direction-recommendation')<html.indexOf('direction-lanes'),'지금 권장 hero가 방향 후보 위에 있지 않습니다.');
  assert(html.includes('aria-label="지금 권장"'));
  assert(html.includes('30라 체크포인트를 현재 패로 닫는 유일한 상위 경로'));
  assert(html.includes('<b>시키</b><em>선위 0</em>'));
  assert.strictEqual((html.match(/direction-candidate [^"\n]*recommended/g)||[]).length,2,'same canonical Upper cards were not highlighted together');
  assert(html.includes('현재 패 확정 순서: 1. 쵸파 상위 (선위 1)'));
  assert(html.includes('미래 참고안 선위 5개 부족'),'미완성 보조안의 부족 경고가 사라졌습니다.');
  assert(html.includes('선택 유지 중'));
  assert(html.includes('우솝(희귀)'),'선택 뒤에만 안전 리롤 근거를 표시해야 합니다.');
  assert(!html.includes('전역 교집합은 표시하지 않음'),'선택한 exact 설계가 아닌 전역 리롤 값을 보여주면 안 됩니다.');
  const physicalButton=html.match(/data-act="choose-direction" data-key="physical"[^>]*>/);
  assert(physicalButton&&!physicalButton[0].includes('disabled'),'safePrefix에 선택 상위가 있는 경로를 잠그지 못했습니다.');
  const dualButton=html.match(/data-act="choose-direction" data-key="dual"[^>]*>/);
  assert(dualButton&&dualButton[0].includes('disabled'),'raw 후보 경고 표시는 유지합니다.');
  assert(source.includes("querySelectorAll('[data-act=\"choose-direction\"]')"),'25라 실제 화면에서 checkpoint 경고 버튼을 다시 여는 후처리가 없습니다.');
  assert(html.includes('data-act="preview-direction" data-key="dual"'),'checkpoint miss must keep its reference preview');
});

check('direction board is three columns on wide screens and one lane per row when narrow',()=>{
  assert(css.includes('.direction-lanes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))'));
  assert(css.includes('@media(max-width:1180px){.direction-lanes{grid-template-columns:1fr}'));
  assert(css.includes('.direction-candidate.selected'));
  assert(css.includes('.direction-candidate.control'));
  assert(css.includes('.direction-candidate.stable'));
  assert(css.includes('.direction-candidate.prefix'));
  assert(css.includes('.direction-recommendation'));
  assert(css.includes('.direction-candidate.recommended'));
});

console.log(`\n${checks}/${checks} direction UI state/action checks passed.`);
