'use strict';

// v18.2 — 추천 흔들림.
//
// 사용자 신고: "지금 할 일이 자꾸 바뀌어서, 만들고 있다가 갑자기 다른
// 걸로 바뀐다."  읽기 누락(v18.1)을 고친 뒤에도 남은 부분을 실측했다.
//
// 실전 로그 7판 재생 기준, 직전 추천을 만들지 않았는데 대상이 바뀐 경우
// 79건.  그런데 그중 35건은 직전 대상이 그 사이 **제작 불가**로 바뀐
// 것이라 다시 계획하는 게 맞다(사용자가 다른 것을 만들어 재료가 빠지는
// 경우).  나머지 44건이 "여전히 만들 수 있는데 다른 걸로 바뀐" 진짜
// 흔들림이다.
//
// 세 가지로 나눠 다룬다.
//
//   ① 타이브레이크로는 뒤집지 않는다 — 순위 벡터의 결정적 구간(회귀·
//      체크포인트·막다른길·역할 전체)이 동점이면 직전 추천을 유지한다.
//      그 뒤는 예비 선위·전투력·등급 소모 같은 타이브레이크뿐이고,
//      선위 0.5 증가로 결정이 뒤집히면 안 된다.
//   ② 열등하지 않으면 바꾸지 않는다 — 어느 필수 역할에서도 뒤지지 않고
//      회귀도 크지 않고 더 비싸지도 않으면 바꿀 이유가 없다.
//   ③ 그래도 바뀌면 "계속 진행해도 되는지"를 말한다 — 서로 다른 역할을
//      닫는 진짜 교환일 때는 엔진 판단을 덮어쓰지 않는다.  대신 직전
//      대상이 아직 유효하면 그 사실을 화면에 남긴다.  사용자가 겪는
//      문제는 순위 변동 자체가 아니라 "만들던 걸 버려야 하나"이다.
//
// 관성이 나쁜 추천을 붙잡지 않는다는 것이 중요하다 — 어떤 조건도
// "더 나쁜 것을 유지"하도록 허용하지 않는다.

const assert=require('assert');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
const warn=console.warn;console.warn=()=>{};
for(const file of [
  'ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js',
  'ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js',
  'ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_core.js',
  'ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js'
])require(path.join(EXT,file));
console.warn=warn;

const E=global.ORDV15Engine,units=global.ORD_TMO_UNITS;
let passed=0;
function test(name,fn){fn();passed+=1;console.log(`PASS ${name}`);}

// rankVector 앞부분이 결정적 구간, 뒤가 타이브레이크다.
function node(id,decisive,tail,extra){
  return Object.assign({
    sequence:[{quote:{targetId:id,unit:{id,name:id},wisp:{cost:1},feasible:true}}],
    rankVector:decisive.concat(tail),
    rankDecisiveLength:decisive.length,
    regression:0,
    assessment:{requirements:[]}
  },extra||{});
}

test('타이브레이크만 다르면 직전 추천을 유지한다',()=>{
  const best=node('NEW',[0,0,0],[1,2,3]);
  const held=node('OLD',[0,0,0],[9,9,9]);
  const picked=E._test.stickyPath([best,held],best,'OLD');
  assert.strictEqual(picked.sequence[0].quote.targetId,'OLD','동점인데 바꿨다');
  assert.strictEqual(picked.stickyHold,'tie');
});

test('결정적 구간에서 더 나쁘면 유지하지 않는다',()=>{
  // 관성이 나쁜 추천을 붙잡으면 안 된다 — 이게 이 장치의 유일한 위험이다.
  const best=node('NEW',[0,0,0],[5,5,5]);
  const held=node('OLD',[0,1,0],[0,0,0],{
    assessment:{requirements:[{key:'slow',required:true,gap:30}]}
  });
  best.assessment={requirements:[{key:'slow',required:true,gap:0}]};
  const picked=E._test.stickyPath([best,held],best,'OLD');
  assert.strictEqual(picked.sequence[0].quote.targetId,'NEW','더 나쁜 것을 붙잡았다');
});

test('필수 역할에서 뒤지지 않고 더 싸면 유지한다',()=>{
  const best=node('NEW',[0,2,0],[0,0,0],{assessment:{requirements:[{key:'slow',required:true,gap:20}]}});
  best.sequence[0].quote.wisp={cost:5};
  const held=node('OLD',[0,1,0],[0,0,0],{assessment:{requirements:[{key:'slow',required:true,gap:10}]}});
  held.sequence[0].quote.wisp={cost:3};
  const picked=E._test.stickyPath([best,held],best,'OLD');
  assert.strictEqual(picked.sequence[0].quote.targetId,'OLD');
  assert.strictEqual(picked.stickyHold,'dominant');
});

test('v23.3(#56 현직 우위): 도전자가 안전 성분에서 못 이기면 값이 비싸도 유지한다',()=>{
  // 종전 계약(v18.2)은 "더 비싸면 열등하지 않아도 해제"였다 — 경제성
  // 미세 우위가 카드를 갈아치우는 회전의 한 원인이었다(0817 실측 12회).
  // 새 독트린: 교체 근거는 안전 성분(회귀·체크포인트·막다른길) 승리뿐이다.
  // 이 픽스처의 도전자(NEW [0,2,0])는 결정적 벡터에서 현직(OLD [0,1,0])을
  // 이기지 못한다 — 현직이 제작 가능하면 값과 무관하게 유지한다.
  const best=node('NEW',[0,2,0],[0,0,0],{assessment:{requirements:[{key:'slow',required:true,gap:20}]}});
  best.sequence[0].quote.wisp={cost:2};
  const held=node('OLD',[0,1,0],[0,0,0],{assessment:{requirements:[{key:'slow',required:true,gap:10}]}});
  held.sequence[0].quote.wisp={cost:9};
  const picked=E._test.stickyPath([best,held],best,'OLD');
  assert.strictEqual(picked.sequence[0].quote.targetId,'OLD','안전 동급 도전자에게 현직을 내줬다');
  assert.strictEqual(picked.stickyHold,'incumbent');
});

test('직전 대상이 후보에 없으면 최선을 그대로 쓴다',()=>{
  const best=node('NEW',[0,0,0],[1,1,1]);
  assert.strictEqual(E._test.stickyPath([best],best,'MISSING'),best);
  assert.strictEqual(E._test.stickyPath([best],best,''),best);
});

test('직전 대상은 후보 목록에서 조용히 사라지지 않는다',()=>{
  // 흔들림 79건 중 직전 대상이 이번 라운드 경로에 남아 있던 것은 8건뿐이었다.
  // 나머지는 순위에서 밀린 게 아니라 후보 풀에서 빠진 것이다.
  const row={unit:{id:'KEEP',name:'KEEP'}};
  const model={settings:{_stickyActionId:'KEEP'}};
  const rows=[{unit:{id:'A'}},{unit:{id:'B'}}];
  const out=E._test.withStickyCandidate(rows,[row],[],model);
  assert.strictEqual(out.length,3,'제작 가능한 직전 대상을 후보에 되살리지 않았다');
  assert(out.some(item=>item.unit.id==='KEEP'));
  // 이미 있으면 중복으로 넣지 않는다.
  assert.strictEqual(E._test.withStickyCandidate([row],[row],[],model).length,1);
  // 어디에도 없으면 그대로 둔다.
  assert.strictEqual(E._test.withStickyCandidate(rows,[],[],model).length,2);
});

test('바뀌더라도 직전 대상이 유효하면 그렇게 말한다',()=>{
  const best=node('NEW',[0,0,0],[0,0,0],{assessment:{requirements:[{key:'slow',label:'이감',required:true,gap:30}]}});
  const held=node('OLD',[0,1,0],[0,0,0],{assessment:{requirements:[{key:'slow',label:'이감',required:true,gap:10}]}});
  const option=E._test.continuableStep([best,held],best,'OLD');
  assert(option,'여전히 이감을 더 닫는데 안내하지 않는다');
  assert.strictEqual(option.id,'OLD');
  assert(option.closes.some(row=>row.key==='slow'));
  // 아무 필수 역할도 더 못 닫으면 붙잡을 이유가 없다.
  const useless=node('OLD2',[0,1,0],[0,0,0],{assessment:{requirements:[{key:'slow',label:'이감',required:true,gap:99}]}});
  assert.strictEqual(E._test.continuableStep([best,useless],best,'OLD2'),null);
  // 최선과 같은 대상이면 안내할 것이 없다.
  assert.strictEqual(E._test.continuableStep([best],best,'NEW'),null);
});

test('화면 배선: 관성 실이 앱에서 이어진다',()=>{
  const fs=require('fs');
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(/_stickyActionId:this\._stickyActionId/.test(app),'직전 추천을 엔진에 넘기지 않는다');
  assert(/this\._stickyActionId=String\(proposed\.id\)/.test(app),'이번 추천을 다음 라운드용으로 기억하지 않는다');
  assert(app.includes('v151-continue'),'"진행 중이던 것" 안내가 화면에 없다');
});

console.log(`V18_2_RECOMMENDATION_STABILITY ${passed}/8 passed`);
