'use strict';
// v20.4.0 계약 — 1번 카드는 어떤 상태에서도 비지 않는다.
//
// v17.28 이 "이 타이밍에 추천을 안 해버리면 굉장히 곤란하다"며 새긴 계약을
// 두 경로가 계속 어기고 있었다.  15판 재생 실측:
//
//  ① "지금 증명되는 제작은 없습니다" HOLD — 빈 카드 57건 중 27건(측정한
//     두 판 기준 전부)이 여기서 나왔다.  0723a r55~r62 는 8라운드 연속으로
//     1번 카드가 백지였는데, 판단 자체는 회복 목표 3개(베이비5 선위부족 2 ·
//     도플라밍고 5 · 키드 3)를 들고 있었다.  말할 것이 있는데 안 실은 것이다.
//  ② ROUTE_CHOICE — 0806a 는 r1~r44 **44라운드 전부** 이 상태였고 그 96개
//     판단 전부 action·blockedAction·proposed·coachAction 이 모두 비어
//     있었다.  그 판의 침묵 37라운드 중 31라운드가 이것으로, 회귀
//     게이트(9라운드)보다 큰 침묵 원인이었다.  r41 시점 1순위는
//     feasible=true·wispGap=0 — 지금 만들 수 있는 것이었다.
//
// 어느 쪽도 승인(action)으로 올리지 않는다.  회복 목표는 "지금 만들라"가
// 아니고, 상위 방향은 사용자가 골라야 하는 판 전체의 결정이기 때문이다.
// v17.28 이 정한 자리(blockedAction)에 실어 "무엇을 기다리는지"만 보인다.
const assert=require('assert'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(EXT,file),'utf8');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

check('① 회복 목표 HOLD 도 카드를 싣는다 — 승인은 아니다',()=>{
  const src=read('ord_v15_engine.js');
  assert(src.includes('function recoveryHoldCard(model,route,locks,recovery,roundNow){'),'회복 카드 헬퍼 없음');
  assert(/blockedAction:recoveryHoldCard\(searchModel,route,locks,recovery,roundNow\)/.test(src),'HOLD 분기에 카드 배선 없음');
  // 승인으로 올리면 안 된다 — 그 분기의 action 은 계속 null 이어야 한다.
  assert(/reason:rare\.safeReroll\?[\s\S]{0,400}action:null,blockedAction:recoveryHoldCard/.test(src),'회복 목표가 승인으로 올라감');
  // 재료 완비 + 선위만 부족한 목표를 최우선으로 고른다(사용자가 할 수 있는 유일한 행동).
  assert(src.includes("const readyLeft=(left.missing||[]).length===0?0:1"),'재료 완비 우선 정렬 없음');
  assert(src.includes('선택 위습 ${wispShort}개만 더 모으면 됩니다'),'선위 부족 안내 문구 없음');
  assert(src.includes("result:'recovery-nearest'"),'회복 카드 표기 없음');
  assert(src.includes('recoveryPreview:true'),'미리보기 표시 없음');
  assert(src.includes('이것은 승인이 아니라 다음 목표입니다'),'승인 아님 고지 없음');
});

check('② 상위 방향 미확정은 침묵 대신 자동 채택으로 흐른다 (v21.0 뒤집기)',()=>{
  // v20.4 는 "자동 확정은 하지 않는다"를 원칙으로 카드만 실었다.  사용자가
  // "전면 재설계"로 그 원칙을 뒤집었다 — 0806a 실측 32라운드 침묵이 근거다.
  // 이제 엔진이 후보 1위 방향을 즉시 채택하고(routeAuto) 실제 추천을
  // 이어간다.  routeChoiceCard 헬퍼와 ROUTE_CHOICE 조기 반환은 은퇴했다.
  const src=read('ord_v15_engine.js');
  assert(!/return finalize\(\{state:'ROUTE_CHOICE'/.test(src),'ROUTE_CHOICE 조기 반환이 되살아남 — 침묵 회귀');
  assert(src.includes('routeAuto={adopted:!route'),'자동 채택 배선 없음');
  assert(src.includes('routeCandidates,routeCandidateLanes}'),'방향판 후보가 판단에 실리지 않음');
  // 사용자 개입 통로는 남는다 — 방향판(routeCandidates)과 확정 버튼.
  assert(read('ord_app.js').includes('decision.routeAuto'),'앱이 자동 채택 사실을 그리지 않음');
});

check('③ 실측 재생 — 침묵 라운드가 없다',()=>{
  const R=require('./lib/reconcile_replay.js');
  R.loadEngine();
  // 0723a 는 회복 목표 HOLD 로 8라운드 연속 백지였던 판.
  const a=R.replayDisplayed('0723a',{fromRound:50,toRound:62});
  const emptyA=a.rounds.filter(row=>!row.error&&!row.hasCard);
  assert.strictEqual(emptyA.length,0,`0723a r50~62 빈 카드 ${emptyA.length}건 (r${emptyA.map(r=>r.round).join(',')})`);
  // 0806a 는 v20.4 까지 44라운드 내내 ROUTE_CHOICE 였던 판 — v21.0 에서는
  // 그 상태 자체가 없어야 하고, 모든 라운드에 카드가 있어야 한다.
  const b=R.replayDisplayed('0806a',{toRound:20});
  const rc=b.rounds.filter(row=>row.state==='ROUTE_CHOICE');
  assert.strictEqual(rc.length,0,`ROUTE_CHOICE 가 ${rc.length}건 살아 있음 — 자동 채택이 안 됨`);
  const blank=b.rounds.filter(row=>!row.error&&!row.hasCard);
  assert.strictEqual(blank.length,0,`0806a r1~20 빈 카드 ${blank.length}건`);
});

console.log(`\n${checks} checks passed (v20.4.0 — 빈 카드 봉합)`);
