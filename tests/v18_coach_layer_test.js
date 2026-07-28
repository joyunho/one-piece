'use strict';

// v18 — 코치 계층의 계약.
//
// v18의 핵심 주장은 "승인을 헐겁게 하지 않고 침묵을 없앤다"는 것이다.
// 그 둘은 쉽게 뒤섞이므로 계약으로 못 박는다:
//
//   ① coachAction / confidence 는 항상 있다.
//   ② confidence.key==='approved' 는 decision.action 이 있을 때만 나온다.
//      (침묵을 줄이려고 승인 도장을 남발하면 여기서 걸린다)
//   ③ 국면(phase)은 라운드가 아니라 상태로 정해진다.
//   ④ 방향 미확정 구간에서 상위 후보들이 서로 다른 제작을 지목하면
//      그 사실을 반드시 말한다 — 첫 클리어 로그의 해당 구간에서 상위
//      3후보의 다음 제작이 매 라운드 서로 달랐다.  틀린 쪽 재료를 먼저
//      먹으면 되돌릴 수 없다.

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

const C=global.ORDCore,E=global.ORDV15Engine,P=global.ORDV15Policy,units=global.ORD_TMO_UNITS;
let passed=0;
function test(name,fn){fn();passed+=1;console.log(`PASS ${name}`);}

// v16 정지 로그에서 뽑아 둔 실제 패 두 개.  전설급은 있는데 필수 역할이
// 열려 있어 승인이 나오지 않던 상태다 — 침묵이 발생하던 바로 그 조건.
const R57={round:57,wisp:2,counts:{'100h':1,'200h':1,'300h':2,'310h':1,'400h':4,'500h':1,'550h':1,'600h':1,'700h':7,'780h':1,'800h':2,'810e':2,'900h':1,D10h:1,D40h:1,E00h:1,G00h:1,I00h:2,J30h:1,M00h:1,Q20h:1,Q30h:1,X20h:1,Z30h:1}};
const R50={round:50,wisp:4,counts:{'100h':5,'200h':1,'300h':2,'310h':1,'400h':7,'500h':2,'600h':3,'700h':2,'720h':1,'780h':1,'800h':1,'810e':4,'900h':5,'910h':1,D10h:2,D40h:1,G00h:1,J30h:1,K00h:1,Q20h:1,U10h:1,X20h:1,Z30h:1,unit_1767884925665_1037:1}};

function decide(fixture,extra){
  return E.decide({
    catalog:units,
    snapshot:{source:'v18-coach-test',counts:fixture.counts,currentAbilities:{},wispCountFound:true,wispCount:fixture.wisp},
    settings:Object.assign({mode:'magic',magicRoute:'singleEnd',currentRound:fixture.round,gorosei:'saturn',postLegendRoute:'upper',superKumaOwned:true},extra||{}),
    locks:[{stage:'upper',id:'D40h',source:'v15-exact-route'}]
  });
}

test('모든 판단에 확신 등급과 국면이 붙는다',()=>{
  for(const fixture of [R50,R57]){
    const decision=decide(fixture);
    assert(decision.confidence,`r${fixture.round}: confidence 없음`);
    assert(['확정','유력','차선','운영'].includes(decision.confidence.level),`알 수 없는 등급 ${decision.confidence.level}`);
    assert(decision.confidence.note,`r${fixture.round}: 확신 등급만 있고 이유가 없다`);
    assert(decision.phase&&decision.phase.key,`r${fixture.round}: 국면 없음`);
    assert(decision.phase.objective,'국면에 목적함수 설명이 없다');
    // 이름이 붙은 다음 행동이든 운영 지시든, 둘 중 하나는 있어야 한다.
    assert(decision.coachAction||decision.confidence.key==='operations',
      `r${fixture.round}: 다음 행동도 운영 지시도 없다 (침묵)`);
  }
});

test("'확정'은 엔진이 승인한 제작에만 붙는다",()=>{
  for(const fixture of [R50,R57]){
    const decision=decide(fixture);
    if(decision.confidence.key==='approved')
      assert(decision.action,`r${fixture.round}: 승인된 행동 없이 '확정' 등급이 나갔다`);
    else
      assert(!decision.action,`r${fixture.round}: 승인된 행동이 있는데 등급이 '${decision.confidence.level}'다`);
  }
});

test('국면은 라운드가 아니라 상태로 정해진다',()=>{
  // 같은 패를 라운드만 바꿔 넣어도, 만들 게 남아 있으면 운영으로 넘어가지
  // 않는다.  첫 클리어 로그의 r51~r54가 51라를 넘겨서도 계속 제작했다.
  const early=decide(R50),late=decide(R50,{currentRound:60});
  assert.strictEqual(early.phase.key,late.phase.key,
    `같은 패인데 라운드만으로 국면이 ${early.phase.key}→${late.phase.key}로 바뀌었다`);
  // 전설급이 하나도 없으면 라운드와 무관하게 개설 국면이다.
  const empty=E.decide({catalog:units,snapshot:{source:'v18-coach-test',counts:{'810e':6},currentAbilities:{},wispCountFound:true,wispCount:6},settings:{mode:'physical',currentRound:40,superKumaOwned:true},locks:[]});
  assert.strictEqual(empty.phase.key,'opening',`전설급 0인데 국면이 '${empty.phase.key}'다`);
});

test('방향 미확정이면 상위 후보들의 의견 일치 여부를 밝힌다',()=>{
  // 방향(magicRoute)을 비우면 엔진은 ROUTE_CHOICE로 간다.
  const decision=E.decide({
    catalog:units,
    snapshot:{source:'v18-coach-test',counts:R50.counts,currentAbilities:{},wispCountFound:true,wispCount:R50.wisp},
    settings:{mode:'magic',magicRoute:'',currentRound:30,gorosei:'saturn',postLegendRoute:'upper',superKumaOwned:true},
    locks:[]
  });
  assert.strictEqual(decision.state,'ROUTE_CHOICE');
  // 이 구간에서 지켜야 할 것은 "행동이 반드시 있다"가 아니라 "화면이 비지
  // 않는다"이다.  지금 선위로 할 수 있는 게 없으면 제작을 지목하지 않는
  // 편이 정확하다 — 감당 못 할 상위를 다음 행동이라 부르던 회귀가 실제로
  // 있었다.  대신 무엇이 얼마나 모자란지를 말해야 한다.
  assert(decision.confidence.note,'방향 미확정 구간에서 화면에 내보낼 것이 없다 — 17라운드 무응답의 재발이다');
  if(decision.coachAction)
    assert.notStrictEqual(decision.coachAction.affordable,false,'감당 못 할 목표를 방향 국면의 다음 행동으로 지목했다');
  else
    assert(/선위|모으는/.test(decision.confidence.note),`제작을 지목하지 않았으면 왜인지 말해야 한다: ${decision.confidence.note}`);
  assert.strictEqual(decision.phase.key,'direction');
  assert(/서로 다른 것을 지목|모두 같은 것을 지목/.test(decision.confidence.note),
    `후보 일치 여부를 밝히지 않는다: ${decision.confidence.note}`);
});

test('닿지 않는 회복 목표를 마감 구간에 반복 제시하지 않는다',()=>{
  // 재료가 11장 모자란 목표를 14라운드 내내 붙잡고 있던 것이 첫 클리어
  // 로그의 r55~r68이다.  마감을 넘긴 뒤 닿지 않는 목표는 운영으로 넘긴다.
  const unreachable={targets:[{id:'440h',name:'류마',feasible:false,wispGap:26,missing:[{name:'조로',count:11}]}]};
  const picked=E._test.reachableRecovery(unreachable);
  assert(picked,'후보가 하나뿐이면 그거라도 골라야 한다');
  assert.strictEqual(picked.feasible,false);
  const mixed={targets:[{id:'a',name:'멀지만 가능',feasible:true,wispCost:9},{id:'b',name:'가깝지만 불가',feasible:false,wispGap:1,missing:[]}]};
  assert.strictEqual(E._test.reachableRecovery(mixed).id,'a','만들 수 있는 목표를 두고 못 만드는 목표를 고른다');
});

test('생존 마감 상수가 정책과 엔진에서 같은 값이다',()=>{
  assert.strictEqual(P.SURVIVAL_DEADLINE_ROUND,50);
  assert.strictEqual(E.OPERATIONS_ROUND,51,'운영 국면은 생존 마감 바로 다음 라운드부터다');
});

console.log(`V18_COACH_LAYER ${passed}/6 passed`);
