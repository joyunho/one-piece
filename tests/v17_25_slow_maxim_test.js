'use strict';

// v17.25: failed-run regression distilled from ORD log seq 427 (round 40).
// Maxim was a zero-wisp, exact-current-hand craft using owned Wyper + Usopp,
// but the old ship round gate and fixed trigger-slow credit hid it.  The same
// run also showed that fulfilled slow vanished from the compact UI and that
// already-owned finals could reappear as recovery targets.

const assert=require('assert');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};

for(const file of [
  'ord_units_data.js',
  'ord_upper_memo.js',
  'ord_synergy_memo.js',
  'ord_data_patch.js',
  'ord_story_nonupper_data.js',
  'ord_story_upper_data.js',
  'ord_upper_combat_data.js',
  'ord_upper_skill_digest.js',
  'ord_upper_skill_dps.js',
  'ord_core.js',
  'ord_squad_planner.js',
  'ord_v15_model.js',
  'ord_v15_ledger.js',
  'ord_v15_policy.js',
  'ord_v15_engine.js',
  'ord_app.js'
])require(path.join(EXT,file));

const C=global.ORDCore;
const Squad=global.ORDSquadPlanner;
const M=global.ORDV15Model;
const L=global.ORDV15Ledger;
const Policy=global.ORDV15Policy;
const Engine=global.ORDV15Engine;
const App=global.ORDApp.App;
const units=global.ORD_TMO_UNITS;

const MAXIM='X30h';
const WYPER='420h';
const USOPP='C20h';
const CAPONE='C10h';
const TASHIGI='N50H';
const NAMI='P20h';
const SHIP=C.PIRATE_SHIP_ID;
const WISP=C.WISP_ID;

const tests=[];
function test(name,fn){tests.push([name,fn]);}
function close(actual,expected,message){
  assert(Math.abs(Number(actual)-Number(expected))<1e-9,message||`${actual} !== ${expected}`);
}

const seq427Counts={
  [WISP]:12,
  [WYPER]:1,
  [USOPP]:1,
  [CAPONE]:1,
  [SHIP]:2,
  [TASHIGI]:1,
  [NAMI]:1,
  '440h':1,
  '640h':1
};

const baseSettings={
  mode:'magic',
  magicRoute:'singleEnd',
  currentRound:40,
  gorosei:'saturn',
  postLegendRoute:'upper',
  superKumaOwned:true,
  labResearch:{slow:true},
  manualCounts:{}
};

function modelFor(counts,settings=baseSettings,currentAbilities={}){
  return M.build({
    catalog:units,
    snapshot:{
      source:'ordlog-seq-427-compact',
      sessionId:'v17-25-maxim',
      seq:427,
      at:1,
      dataChangedAt:1,
      counts:Object.assign({},counts),
      currentAbilities:Object.assign({},currentAbilities),
      wispCountFound:true,
      wispCount:C.num(counts[WISP])
    },
    settings:Object.assign({},settings),
    locks:[{stage:'upper',id:TASHIGI,source:'tmo'}]
  });
}

function slowBoard(maxim,gorosei='saturn'){
  const counts={[NAMI]:1};
  const currentAbilities={'이동속도 감소':60,'발동이동속도 감소':maxim?72:42};
  if(maxim)counts[MAXIM]=1;
  const state=C.normalizeState(
    units,
    {counts,currentAbilities,wispCountFound:true,wispCount:0},
    {manualCounts:{},superKumaOwned:true}
  );
  const settings={
    mode:'magic',
    magicRoute:'singleEnd',
    _resolvedMagicRoute:'singleEnd',
    gorosei,
    superKumaOwned:true,
    labResearch:{slow:true}
  };
  const spec=C.currentSpec(state,'magic',settings);
  const deficits=C.deficits(spec,'magic',settings);
  return{state,settings,spec,deficits,slow:deficits.requirements.find(row=>row.key==='slow')};
}

function appFor(gorosei='saturn'){
  const app=Object.create(App.prototype);
  app.state={
    mode:'magic',
    magicRoute:'singleEnd',
    directionKey:'singleEnd',
    directionUpperId:TASHIGI,
    currentRound:40,
    roundStartedAt:0,
    roundPrepSeconds:0,
    roundNormalSeconds:60,
    roundBossSeconds:60,
    locks:[{stage:'upper',id:TASHIGI,source:'tmo'}],
    gorosei,
    rerollsUsed:0
  };
  return app;
}

test('seq 427 원장: 방주맥심은 선위 0이며 와이퍼·우솝을 정확히 쓴다',()=>{
  const model=modelFor(
    seq427Counts,
    baseSettings,
    {'이동속도 감소':60,'발동이동속도 감소':42}
  );
  const quote=L.quote(model,MAXIM,model.effective.counts,{availableRound:40});

  assert.strictEqual(quote.feasible,true,quote.blocked.join(' · '));
  assert.strictEqual(quote.wisp.cost,0);
  assert.strictEqual(quote.wisp.after,12);
  assert.deepStrictEqual(quote.rareUse,{[WYPER]:1,[USOPP]:1});
  assert.strictEqual(quote.consumed[WYPER],1);
  assert.strictEqual(quote.consumed[USOPP],1);
  assert.strictEqual(quote.consumed[CAPONE],1);
  assert.strictEqual(quote.consumed[SHIP],1);
  assert.strictEqual(quote.prerequisite.allowed,true);
});

test('해적선 재료가 없으면 방주맥심은 라운드와 무관하게 엄격히 차단된다',()=>{
  const counts=Object.assign({},seq427Counts);
  delete counts[SHIP];
  const model=modelFor(counts);
  const quote=L.quote(model,MAXIM,model.effective.counts,{availableRound:40});

  assert.strictEqual(quote.feasible,false);
  assert.strictEqual(quote.prerequisite.allowed,false);
  assert(quote.blocked.some(reason=>/해적선 필요/.test(reason)),quote.blocked.join(' · '));
});

test('나미 뒤 방주맥심의 다중 발동이감 안전 순증은 25.8이다',()=>{
  const before=slowBoard(false);
  const after=slowBoard(true);

  assert.strictEqual(before.deficits.control.triggerSlowSources,1);
  assert.strictEqual(after.deficits.control.triggerSlowSources,2);
  close(before.slow.current,91);
  close(after.slow.current,116.8);
  close(after.slow.current-before.slow.current,25.8);

  // Exercise the squad scorer too: it must recompute the whole trigger pool
  // at the multi-source .65 weight, rather than value Maxim as 30 * .5 = 15.
  const maximVector={
    staticSlow:0,
    triggerSlow:30,
    triggerSlowSources:1,
    slow:15
  };
  const wideGap={
    control:{
      staticSlow:before.deficits.control.staticSlow,
      triggerSlow:before.deficits.control.triggerSlow,
      triggerSlowSources:before.deficits.control.triggerSlowSources
    },
    rows:[{key:'slow',current:91,target:191,gap:100,weight:1,required:true}]
  };
  close(Squad._test.staticPotential(maximVector,wideGap),0.258);
});

test('compact UI는 충족 이감·나스쥬로 목표·계산 대기를 항상 보여 준다',()=>{
  const saturn=slowBoard(true,'saturn');
  const saturnHtml=appFor('saturn').renderV153Spec(saturn.state,{
    v15Decision:{assessment:{requirements:saturn.deficits.requirements}}
  });
  // v18.7: 표기가 한 형식으로 통일되면서 "현재" 접두어가 빠졌다 — 열 위치가
  // 이미 현재값을 뜻한다.  계약의 알맹이(충족이어도 이감 수치가 화면에 남는다)는
  // 그대로다: v17.24 는 gap>0 인 카드만 그려 116.8/102 가 사라졌었다.
  assert(saturnHtml.includes('data-role="slow"'));
  assert(saturnHtml.includes('116.8'));
  assert(saturnHtml.includes('/ 목표 102'));
  assert(saturnHtml.includes('충족'));

  const nasjuro=slowBoard(true,'nasjuro');
  const nasjuroHtml=appFor('nasjuro').renderV153Spec(nasjuro.state,{
    v15Decision:{assessment:{requirements:nasjuro.deficits.requirements}}
  });
  assert(nasjuroHtml.includes('116.8'));
  assert(nasjuroHtml.includes('/ 목표 117'));
  assert(nasjuroHtml.includes('부족 0.2'));

  const waitingHtml=appFor('saturn').renderV153Spec(saturn.state,{
    v15Decision:{assessment:{requirements:[]}}
  });
  assert(waitingHtml.includes('data-role="slow"'));
  assert(waitingHtml.includes('현재 계산 대기'));
  assert(waitingHtml.includes('/ 목표 102'));
  assert(waitingHtml.includes('<strong>계산 대기</strong>'));
});

test('통합 보조 목록은 최대 3개이며 seq 427 방주맥심을 노출한다',()=>{
  const model=modelFor(
    seq427Counts,
    baseSettings,
    {'이동속도 감소':60,'발동이동속도 감소':42}
  );
  const after=slowBoard(true);
  const squadPlan={
    targetCount:9,
    adaptiveTargets:{selected:9},
    finalLineup:[{id:MAXIM,reason:'발동이감·마방깎·폭뎀증'}],
    safePrefix:{actions:[{id:MAXIM,reason:'발동이감 보강'}]},
    actions:[{id:MAXIM,reason:'발동이감 보강'}],
    rareAllocation:[]
  };
  const plan={
    mode:'magic',
    upper:model.effective.db.byId.get(TASHIGI),
    settings:model.settings,
    spec:after.spec,
    deficits:after.deficits,
    squadPlan,
    v15Decision:{assessment:{requirements:after.deficits.requirements}}
  };
  const app=appFor();
  const rows=app.v151BuildableLegendRows(model.effective,plan);

  assert(rows.length<=3,`보조 ${rows.length}개가 노출됨`);
  const maxim=rows.find(row=>row.unit.id===MAXIM);
  assert(maxim,'방주맥심이 통합 보조 3개에서 누락됨');
  assert.strictEqual(maxim.feasible,true);
  assert.strictEqual(maxim.squadSupport,true);
  assert.strictEqual(maxim.solve.wispCost,0);

  const html=app.renderV153UpperParty(model.effective,plan);
  const supportHtml=html.slice(html.indexOf('v153-support-list'));
  const supportIds=[...supportHtml.matchAll(/data-id="([^"]+)"/g)].map(match=>match[1]);
  assert(supportIds.length<=3,`UI 보조 ${supportIds.length}개가 노출됨`);
  assert(supportIds.includes(MAXIM),'UI 보조 목록에 방주맥심이 없음');
  assert(/방주맥심/.test(supportHtml));
});

test('회복 후보는 이미 보유한 전설급·상위를 다시 추천하지 않는다',()=>{
  const ownedCounts={
    [WISP]:0,
    [TASHIGI]:1,
    [NAMI]:1,
    '230h':1,
    '440h':1,
    'O30h':1,
    '640h':1
  };
  const model=modelFor(ownedCounts,Object.assign({},baseSettings,{labResearch:null}));
  const route=Policy.ROUTES.singleEnd;
  const locks=[{stage:'upper',id:TASHIGI,source:'tmo'}];
  const assessment=Policy.evaluate(model,model.effective.counts,route,{round:40,locks});
  const recovery=Engine._test.recoveryPlan(model,route,locks,assessment,{limit:20});

  assert(recovery&&recovery.targets.length>0,'회복 후보 자체가 사라짐');
  const ownedIds=new Set(Object.keys(ownedCounts).filter(id=>id!==WISP&&C.num(ownedCounts[id])>0));
  const repeated=recovery.targets.filter(row=>ownedIds.has(row.id));
  assert.deepStrictEqual(
    repeated.map(row=>row.id),
    [],
    `이미 보유한 유닛이 회복 후보에 재등장: ${repeated.map(row=>row.name).join(' · ')}`
  );
});

let passed=0;
for(const [name,fn] of tests){
  try{
    fn();
    passed+=1;
    console.log(`PASS ${name}`);
  }catch(error){
    console.log(`FAIL ${name}`);
    console.log(error&&error.stack||error);
  }
}
console.log(`V17_25_SLOW_MAXIM ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
