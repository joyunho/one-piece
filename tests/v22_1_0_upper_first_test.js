'use strict';
// v22.1.0 계약 — 상위 확정 최우선 (0809 r38 실패 로그 포렌식).
//
// 포렌식: r24-25 코치 1순위(샬롯 크래커)가 확정 예정 상위 (S)료쿠규의
// 유일 희귀 재료 킨에몬을 소모했고, 확정 직후 위습 13<15 로 7라운드
// 무추천 침묵, r32·r35 상위 승인은 다른 표시 층에 가려질 수 있었다.
// 사용자: "상위 확정했는데 해당 상위 먼저 안올리고 이상한거 추천했다가
// 상위랑 멀어지고 이게 뭐야. 그리고 25라전에 확정안되는거 풀어" +
// "상위에 들어가는 희귀함은 따로 알려줘야할 것 같아" +
// "스토리가 35라 전에 13까지 밀려야하는데 안밀려서 죽었어".
//
// ① 마일스톤 견적의 확정 상위 트리 보호(킨에몬 시나리오 재현)
// ② committed-upper 승인은 표시 잠금·파티 플래너가 덮지 않는다
// ③ 25라 확정 게이트 제거(리롤 게이트는 유지)
// ④ 확정 상위 재료 목록 + 스토리 스텝퍼(10@30 · 13@35)

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const appSrc=read('ord_app.js'),engineSrc=read('ord_v15_engine.js'),css=read('ord_ui_v20.css');
const tests=[];
function test(name,fn){tests.push([name,fn]);}

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,engine=context.ORDV15Engine,App=context.ORDApp.App;
const cat=context.ORD_TMO_UNITS;
const mk=(counts,wisp,locks)=>({catalog:cat,snapshot:{source:'v221',counts:Object.assign({[C.WISP_ID]:wisp},counts),wispCountFound:true,wispCount:wisp,currentAbilities:{}},settings:{currentRound:14,mode:'physical',magicRoute:'auto',manualCounts:{}},locks:locks||[]});
// 0809 재현 패: 샬롯 크래커(H30h = G20h+킨에몬+720h) 전 재료 보유, 전설 0.
const HAND={G20h:1,J20h:1,'720h':1};

test('① 대조: 상위 확정이 없으면 첫 전설 견적이 킨에몬을 소모할 수 있다 (0809 실황)',()=>{
  const decision=engine.decide(mk(HAND,12));
  assert.strictEqual(decision.evidence&&decision.evidence.completionMilestone,'firstFinal','첫 전설 마일스톤이 아니다');
  const pick=decision.action||decision.blockedAction;
  assert(pick,'첫 전설 후보가 없다');
  assert.strictEqual(pick.id,'H30h',`재현 전제가 흔들림: 1순위가 ${pick.name}`);
  assert(C.num(pick.quote.consumed&&pick.quote.consumed.J20h)>0,'대조군에서 킨에몬 소모가 없다 — 시나리오 자체가 무효');
});

test('① 봉합: (S)료쿠규 확정 시 마일스톤 견적이 킨에몬을 먹지 않는다',()=>{
  const decision=engine.decide(mk(HAND,12,[{stage:'upper',id:'LB0H',source:'sniped'}]));
  assert.strictEqual(decision.evidence&&decision.evidence.completionMilestone,'firstFinal');
  const guard=decision.evidence&&decision.evidence.lockedUpperGuard;
  assert(guard&&guard.reservedUnits>0,'확정 상위 트리 보호 증거가 없다');
  assert(/료쿠규/.test(String(guard.name)),`보호 대상이 료쿠규가 아니다: ${guard.name}`);
  const pick=decision.action||decision.blockedAction;
  assert(pick,'보호 중에도 첫 전설 후보는 제시되어야 한다');
  assert(!(pick.quote.consumed&&C.num(pick.quote.consumed.J20h)>0),`확정 상위의 유일 희귀 재료(킨에몬)를 여전히 소모한다: ${pick.name}`);
  assert(String(decision.reason||'').includes('트리 재료')||String(pick.reason||'').includes('트리 재료'),'보호 사실이 사유에 없다');
});

test('② committed-upper 승인은 다른 유닛의 표시 잠금이 덮지 않는다',()=>{
  const approved={state:'ACT_NOW',evidence:{upperFirst:true},action:{id:'LB0H',name:'료쿠규'}};
  const out=engine._test.applyCraftLock(approved,{settings:{_craftLockId:'H30h'}},[]);
  assert.strictEqual(out,approved,'표시 잠금이 확정 상위 승인을 교체했다');
});

test('② committed-upper 승인은 파티 플래너 룰 차이로 강등되지 않는다',()=>{
  const approved={state:'ACT_NOW',evidence:{upperFirst:true},action:{id:'LB0H',name:'료쿠규'},model:{settings:{}}};
  const out=engine.reconcileSquadExecution(approved,{safePrefix:{actions:[]}},[]);
  assert.strictEqual(out.state,'ACT_NOW','빈 프리픽스가 확정 상위 승인을 HOLD 로 강등했다');
  assert(out.evidence&&out.evidence.squadBypassCommittedUpper,'우회 증거가 없다');
  assert.strictEqual(out.action&&out.action.id,'LB0H');
});

test('③ 25라 확정 게이트 제거 — 리롤 게이트는 유지',()=>{
  assert(!appSrc.includes('방향 확정은 25라운드부터'),'확정 게이트 토스트가 남아 있다');
  assert(!appSrc.includes("'25라부터 확정'"),'확정 버튼 25라 문구가 남아 있다');
  // v23.6 재핀: 리롤 게이트는 항법 의존이 됐다 — 기본 항법 25라 유지,
  // 적극 리롤 항법(리스크헷지·카지노)+상위 확정만 18라 개방(사용자 지시).
  assert(appSrc.includes('rerollGateRound=navReroll.aggressiveReroll&&this.upperLock()?18:25'),'항법 의존 리롤 게이트가 사라졌다(기본 25라는 이 식 안에 산다)');
  assert(engineSrc.includes('라운드 수입으로 모으면 됩니다'),'확정 상위 위습 카운트다운 문구가 없다');
  assert(!engineSrc.includes('다른 제작과 희귀 리롤을 잠급니다'),'실동작과 다른 옛 보호 문구가 남아 있다');
});

test('④ 확정 상위 재료 목록 — 킨에몬이 이름으로 보인다',()=>{
  const obj=Object.create(App.prototype);
  obj.upperLock=()=>({id:'LB0H'});
  const state=C.normalizeState(context.ORD_TMO_UNITS,{counts:{J20h:1},currentAbilities:{}},{manualCounts:{}});
  state.wisp=13;
  const mats=obj.v221UpperMaterials(state);
  assert(mats&&/료쿠규/.test(mats.upperName),'확정 상위 인식 실패');
  assert(mats.use.some(item=>/킨에몬/.test(item.name)),'보유 희귀 재료(킨에몬)가 목록에 없다');
  const html=obj.v221UpperMaterialsBlock(state);
  assert(html.includes('v221-upper-mats')&&html.includes('킨에몬'),'재료 블록 마크업 누락');
  assert(html.includes('부족')&&/보유 13/.test(html),'위습 카운트다운이 없다');
  obj.upperLock=()=>null;
  assert.strictEqual(obj.v221UpperMaterialsBlock(state),'','상위 미확정에 재료 블록이 뜬다');
});

test('④ 스토리 스텝퍼 — 13@35 마감선(사용자 실측)과 페이스 경고',()=>{
  const obj=Object.create(App.prototype);
  obj.state={storyStage:9};
  obj.upperLock=()=>({id:'LB0H'});
  obj.actualRound=()=>33;
  const behind=obj.v221StoryBlock();
  assert(behind.includes('v221-story')&&behind.includes('behind'),'35라 임박 경고가 없다');
  assert(behind.includes('13단계'),'13단계 마감선 표기가 없다');
  obj.actualRound=()=>36;
  obj.upperLock=()=>null;
  const late=obj.v221StoryBlock();
  assert(late.includes('late')&&late.includes('마감선 지남'),'마감선 초과 표시가 없다');
  assert(late.includes('상위'),'상위 부재 연결 안내가 없다');
  obj.actualRound=()=>7;
  assert.strictEqual(obj.v221StoryBlock(),'','스토리 구간 밖에서 스텝퍼가 뜬다');
  assert(appSrc.includes("a==='story-stage-step'")&&appSrc.includes('storyStage:0'),'스텝퍼 배선·기본값 누락');
  for(const sel of ['.v221-upper-mats{','.v221-story{','.v221-story-row button{','.v221-story.late{'])assert(css.includes(sel),`CSS 누락: ${sel}`);
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V22_1_0_UPPER_FIRST ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
