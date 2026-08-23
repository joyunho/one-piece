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
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js'])require(path.join(EXT,file));

const App=global.ORDApp.App;
const C=global.ORDCore;
const source=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
const css=fs.readFileSync(path.join(EXT,'ord_ui_v20.css'),'utf8');
const between=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}

check('live coach exposes one status strip and four decision regions',()=>{
  const app=Object.create(App.prototype);
  app.state={mode:'physical',magicRoute:'auto',virtualSpecialId:'',locks:[]};
  app.upperLock=()=>null;
  // v22.0(사용자 승인 목업): 다음 제작 레일은 마감 국면(40~50라)에만 열린다
  // — 후보 배선 검사는 그 국면(45라)에서 한다.  국면 패널의 게이지는
  // observedDeficits 를 읽으므로 스텁을 준다.
  app.state.currentRound=45;
  app.observedDeficits=()=>({clearRows:[]});
  app.renderV151NextAction=()=>'<i data-test="next"></i>';
  app.renderV153Status=()=>'<section data-region="game-status"><i data-test="status"></i></section>';
  app.renderV153Preview=()=>'<i data-test="candidate"></i>';
  app.renderV153Spec=()=>'<i data-test="spec"></i>';
  app.renderV153CraftableLegends=()=>'<i data-test="rare"></i>';app.renderV153UnusedRare=()=>'<i data-test="unused"></i>';
  app.renderV153UpperParty=()=>'<i data-test="upper"></i>';
  const plan={v15Decision:{state:'ACT_NOW'},postLegendDecision:{awaiting:false}};
  const html=app.renderCoach({},plan,{}, {},{ready:true,key:'ok'});
  const regions=[...html.matchAll(/data-region="([^"]+)"/g)].map(match=>match[1]);
  // v24.0(사용자: "구조 자체가 문제인것같은데"): 플레이/분석 2화면 분리 —
  // 판 중 화면은 상태 한 줄 + 지금 할 일(+레일)뿐이다.  국면 패널과 참고
  // 3패널(최종 파티·희귀→전설·남는 희귀)은 분석 화면으로 옮겨졌다
  // (v24_0_0_two_screen_test 가 분석 쪽 구성을 계약한다).
  assert.deepStrictEqual(regions,['game-status','next-action','next-preview']);
  assert.strictEqual(new Set(regions).size,3);
  for(const key of ['status','next','candidate'])assert.strictEqual((html.match(new RegExp(`data-test="${key}"`,'g'))||[]).length,1,key);
  for(const key of ['spec','rare','upper','unused'])assert(!html.includes(`data-test="${key}"`),`분석으로 옮겨진 패널이 플레이 화면에 있다: ${key}`);
  for(const removed of ['ord-tabs','v15-rare-board','coach-details','v15-outcome-dock'])assert(!html.includes(removed),removed);
  assert(html.includes('v153-screen'));
});

check('route and post-Legend states keep the compact five-region shell visible',()=>{
  const app=Object.create(App.prototype);
  app.state={mode:'physical',magicRoute:'auto',virtualSpecialId:'',locks:[]};
  app.upperLock=()=>null;
  app.renderV151NextAction=()=>'<i></i>';
  for(const name of ['Status','NextCandidate','Spec','RareLedger','UpperParty'])app[`renderV153${name}`]=()=>name==='Status'?'<section data-region="game-status"></section>':'<i></i>';
  const route=app.renderCoach({}, {v15Decision:{state:'ROUTE_CHOICE'},postLegendDecision:{awaiting:false}}, {}, {}, {ready:true,key:'ok'});
  const postLegend=app.renderCoach({}, {v15Decision:{state:'ACT_NOW'},postLegendDecision:{awaiting:true}}, {}, {}, {ready:true,key:'ok'});
  assert.strictEqual((route.match(/data-region=/g)||[]).length,3); // v24.0 플레이 3영역
  assert.strictEqual((postLegend.match(/data-region=/g)||[]).length,3); // v24.0
});

check('Rare focus shows the pre-upper safe reroll and at most three craftable Legends',()=>{
  const app=Object.create(App.prototype);
  app.state={rerollsUsed:0};
  app.upperLock=()=>null;
  const rareUnit={id:'rare-a',name:'남는 희귀',image:''};
  const legends=Array.from({length:9},(_,index)=>({
    unit:{id:`legend-${index}`,name:`전설 ${index+1}`,image:''},
    feasible:true,
    solve:{wispCost:index+1},
    rareSpend:{byId:[{name:'남는 희귀',use:1}]}
  }));
  // v17.28: 이 칸은 "내 희귀함으로 만들 수 있는" 목록이라 희귀 소모를
  // 요구하는 계산(v153RareCraftRows)으로 바뀌었고 상한도 3 → 8이다.
  app.v153RareCraftRows=()=>legends.slice(0,8);
  app.v151BuildableLegendRows=()=>legends;
  // v18.4: 한 칸이던 "희귀 판단"이 3번(만들 수 있는 전설급)과 6번(안 쓰는
  // 희귀)으로 갈렸다. 검사도 둘로 나눈다 — 목록 상한과 리롤 배너는 각자
  // 다른 패널의 계약이다.
  const stateStub={db:{byId:new Map([[rareUnit.id,rareUnit]])}};
  const ledgerStub={v15Decision:{rare:{rows:[
    {id:rareUnit.id,name:rareUnit.name,unit:rareUnit,initial:1,use:0,hold:0,reroll:1,reason:'확정 사용처 없음'}
  ]}}};
  const craftHtml=app.renderV153CraftableLegends(stateStub,ledgerStub);
  const unusedHtml=app.renderV153UnusedRare(stateStub,ledgerStub);
  assert(unusedHtml.includes('상위 전 안전 리롤'));
  assert(unusedHtml.includes('남는 희귀'));
  assert(craftHtml.includes('전설 1'),'제작 가능 목록이 비어 있다');
  // v19.8(사용자 요청 ③): 카드 6개까지 보이고 나머지는 "전체 보기"로 넘긴다.
  assert.strictEqual((craftHtml.match(/<button/g)||[]).length,7,'카드 6개 + 전체 보기 1개');
  assert(craftHtml.includes('전체 제작각'),'나머지로 넘어가는 입구가 없다');
});

check('the primary card exposes one action, reason, after-state, stop condition and uncertainty',()=>{
  const app=Object.create(App.prototype);
  const html=app.renderV15Decision({v15Decision:{
    state:'ACT_NOW',
    label:'방깎 마감 보강',
    reason:'50라 전에 상시 방깎을 먼저 닫아야 합니다.',
    unknowns:['보스 DPS 실측 없음','컨트롤 성공 여부 미측정'],
    action:{
      id:'armor-one',name:'방깎 보조',wispCost:13,wispAfter:2,
      stopCondition:'TMO 패가 바뀌면 제작하지 말고 동기화하세요.',
      deltas:[{label:'상시 방깎',before:150,after:180,target:180,delta:30}],
      unit:{id:'armor-one',name:'방깎 보조',image:''}
    }
  }});
  assert.strictEqual((html.match(/data-act="mark-made"/g)||[]).length,1,'live card must expose exactly one resource action');
  for(const phrase of ['이유','이 행동 뒤','멈춤 조건','프로그램이 모르는 것','방깎 마감 보강','보스 DPS 실측 없음'])assert(html.includes(phrase),phrase);
  assert(html.includes('<b>13</b>'),'exact action wisp cost is not shown');
  assert(html.includes('제작 후 2'),'finite post-action wisp balance is not shown');
  assert(html.includes('150 → 180 / 180'),'exact role after-state is not shown');
  assert(!html.includes('클리어 확률'));
  assert(!html.includes('흔함 소비'));

  const prepare=app.renderV15Decision({v15Decision:{
    state:'PREPARE',label:'1순위 재료 보호',reason:'필요 선위가 모일 때까지 보류',
    blockedAction:{id:'next-one',name:'다음 보조',wispCost:8,wispAfter:-3,unit:{id:'next-one'},stopCondition:'선위 8개 전에는 제작 금지'}
  }});
  assert(prepare.includes('<h2>다음 보조</h2>'),'PREPARE hid the exact target');
  assert(prepare.includes('<b>8</b>'),'PREPARE hid the exact required wisp');
  assert(prepare.includes('확보 전 잠금'));
  assert(prepare.includes('disabled>재료 준비 중 · 제작 잠금'));
  assert(!prepare.includes('data-act="mark-made"'),'blocked preparation became executable');
});

check('physical and magic modes are directly selectable and magic exposes its route choice',()=>{
  const app=Object.create(App.prototype);
  app.actualRound=()=>25;
  app.upperLock=()=>null;
  app.state={mode:'physical',magicRoute:'auto',locks:[]};
  const state={wisp:7,db:{byId:new Map()}};
  const plan={v15Decision:{assessment:{route:{label:'물딜 구조'}}}};
  const health={ready:true,label:'연결됨',ageSec:0,key:'ok'};
  let html=app.renderV15Livebar(state,plan,{running:false},health);
  assert(html.includes('data-act="mode" data-value="physical"'));
  assert(html.includes('data-act="mode" data-value="magic"'));
  assert(!html.includes('aria-label="마딜 경로"'));
  app.state.mode='magic';
  app.state.magicRoute='dual';
  html=app.renderV15Livebar(state,plan,{running:false},health);
  assert(html.includes('aria-label="마딜 경로"'));
  assert(html.includes('value="dual" selected'));
  assert(html.includes('value="singleEnd"'));
});

check('152-kill panel uses the v15 projected completion without overwriting original TMO',()=>{
  const app=Object.create(App.prototype),special={id:'special-152',name:'보상 특별',groupName:'특별함',stuffs:[]},rare={id:'rare-target',name:'예상 희귀',groupName:'희귀함',stuffs:[{id:special.id,count:1}]},db={byId:new Map([[special.id,special],[rare.id,rare]]),specials:[special],rares:[rare]};
  app.state={virtualSpecialId:special.id};
  // v20.5: 계약의 알맹이는 "152 보상을 반사실로만 계산하고 실제 TMO 값을
  // 덮어쓰지 않는다"이고, 그건 그대로다.  바뀐 건 그 결과를 무엇으로
  // 말하느냐다 — 완성도 %를 전부 걷어냈으므로("티모 %이제 필요없잖아
  // 없애줘") 이 칸도 선택위습 환산으로 말한다.  모델이 실어 보내는
  // recipe(before/after/saved)를 그대로 쓴다.
  const state={db,rawCounts:{},counts:{[special.id]:1},percent:{[special.id]:50,[rare.id]:41}},plan={v15Decision:{model:{effective:{completionById:{[rare.id]:{originalTmoPercent:41,predictedTmoPercent:67,rankingPercent:67,delta:26,isProjected:true,virtualSpecialId:special.id,reason:'virtual-special-counterfactual',recipe:{totalWispEquivalent:12,beforeWispEquivalent:12,afterWispEquivalent:4,savedWispEquivalent:8,materialConsumed:1}}}}}}};
  const html=app.renderV151RewardForecast(state,plan);
  assert(!/%/.test(html),`152 칸에 완성도% 잔재: ${html.slice(0,200)}`);
  assert(html.includes('선택위습 12 → <strong>4</strong>'),'선택위습 전후가 없음');
  assert(html.includes('선위 8 절약'),'절약분이 없음');
  assert(html.includes('실제 패를 바꾸지 않고'),'반사실 해명이 사라짐');
});

check('upper choice consumes only v15 route candidates, caps them at six and hides Common totals',()=>{
  const app=Object.create(App.prototype);
  app.state={mode:'physical',magicRoute:'auto',directionKey:'',directionUpperId:''};
  const routeCandidates=Array.from({length:7},(_,index)=>({
    id:`upper-${index+1}`,name:`상위 후보 ${index+1}`,routeKey:'physical',routeLabel:'물딜',
    completion:90-index,feasible:true,wispCost:index+1,wispAfter:20-index,
    tiers:{rare:3-index%2,special:2,uncommon:4,common:99},tierAvailable:{rare:6,special:8,uncommon:12,common:63},
    reason:'현재 패 정확 원장 비교',projectedSupport:{exactPrefix:true,steps:[]}
  }));
  const html=app.renderV15RouteChoice({}, {v15Decision:{state:'ROUTE_CHOICE',reason:'상위는 전설 3기분으로 계산',routeCandidates}});
  assert.strictEqual((html.match(/<article class="v15-route-card/g)||[]).length,6);
  assert(html.includes('상위 후보 1'));
  assert(html.includes('상위 후보 6'));
  assert(!html.includes('상위 후보 7'));
  assert(html.includes('희귀 소비'));
  assert(html.includes('특별·안흔 소비'));
  assert(!html.includes('흔함 소비'));
  assert(!html.includes('99/63'),'Common ledger leaked into the live route cards');

  routeCandidates[0].feasible=false;
  routeCandidates[0].projectedSupport={exactPrefix:false,steps:[]};
  const blocked=app.renderV15RouteChoice({}, {v15Decision:{state:'ROUTE_CHOICE',routeCandidates:[routeCandidates[0]]}});
  assert(blocked.includes('희귀 상위 필요'));
  assert(blocked.includes('특별·안흔 상위 필요'));
  assert(!blocked.includes('희귀 소비'),'미제작 상위를 실제 소비량처럼 표시함');
});

check('v15 source and CSS keep the compact single-screen hierarchy',()=>{
  const coachSource=between('  renderCoach(state,plan,phase,clock,health){','  renderCoachDetails(state,plan,open=false){');
  // v24.0(플레이/분석 2화면): 플레이 화면은 상태·지금 할 일·레일·스토리
  // 스텝퍼만 부른다.  국면 패널·참고 3패널 호출은 분석 화면
  // (renderV240Analysis)으로 옮겨졌다.
  for(const method of ['renderV153Status','renderV151NextAction','renderV153Preview','v221StoryBlock'])assert(coachSource.includes(method),method);
  for(const method of ['renderV22PhasePanel','renderV153CraftableLegends','renderV153UpperParty'])assert(!coachSource.includes(method),`분석으로 옮겨진 호출이 플레이에 남음: ${method}`);
  const analysisSource=between('  renderV240Analysis(state,plan,health){','  // A live TMO snapshot');
  for(const method of ['renderV22PhasePanel','renderV153UpperParty','renderV153CraftableLegends','renderV153UnusedRare'])assert(analysisSource.includes(method),`분석 화면 호출 누락: ${method}`);
  assert(source.includes('renderV153Spec(state,plan)'),'전체 스펙 표 폴드 호출이 사라짐');
  // v17.28: 희귀 장부의 제작 목록은 보유 희귀를 실제로 쓰는 조합만 싣는
  // 계산으로 바뀌었다.  옛 계산은 희귀 소모를 요구하지 않아 "희귀 직접
  // 소모 없음" 항목이 그대로 실렸다.
  assert(source.includes('this.v153RareCraftRows(state,plan)'),'rare-based craft list must stay reachable from the rare ledger');
  assert(source.includes('C.rareCraftableLegends'),'rare-based craft list must use the core ledger calculation');
  assert(source.includes('data-opt="virtualSpecialId"'),'152 selector must stay reachable from collapsed settings');
  assert(!coachSource.includes('renderActions('));
  assert(!coachSource.includes('renderSquadPlan('));
  // v18.4 상시 6영역 → v21.1 7개 → v24.0 플레이 2개(next-action ·
  // next-preview 리터럴, game-status 는 renderV153Status 안).
  assert.strictEqual((coachSource.match(/data-region=/g)||[]).length,2);
  // v20.2: 레이아웃 계약을 실제 로드되는 신작 시트(ord_ui_v20.css) 기준으로
  // 갱신한다.  구 12열 그리드(.v153-grid)는 v20.1.0 신작 UI에서 3칼럼
  // 지휘 콘솔(.v155-dashboard)로 교체됐다 — 은퇴한 시트를 읽던 계약이
  // 통과하는 바람에 실사용 화면의 스타일 유실을 못 잡았다(v20.2 실측).
  for(const selector of ['.v153-screen{','.v155-dashboard{','.v153-status{','.v153-panel{','.v240-analysis{','.v153-unused{'])assert(css.includes(selector),selector);
  // v24.0: 2열 그리드 은퇴 — 플레이 단일 칼럼 + 분석 세로 펼침.
  assert(css.includes('.v240-play{')&&!css.includes('"action refer"'),'2화면 레이아웃 계약 없음');
});

console.log(`\n${checks}/${checks} v15 live-coach UI contract checks passed.`);
