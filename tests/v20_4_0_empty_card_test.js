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

check('② 상위 방향 미확정도 카드를 싣는다 — 자동 확정은 하지 않는다',()=>{
  const src=read('ord_v15_engine.js');
  assert(src.includes('function routeChoiceCard(model,route,locks,routeCandidates,roundNow){'),'방향 카드 헬퍼 없음');
  assert(/blockedAction:routeChoiceCard\(model,leadRoute,locks,routeCandidates,roundNow\)/.test(src),'ROUTE_CHOICE 분기에 카드 배선 없음');
  assert(src.includes("result:'route-choice-lead'"),'방향 카드 표기 없음');
  assert(src.includes('routeChoicePending:true'),'확정 대기 표시 없음');
  // 자동 확정 금지 — 이 카드는 승인이 아니고, 확정 전에는 아무것도 안 만든다.
  assert(src.includes('상위 방향을 확정하기 전에는 어떤 제작도 승인하지 않습니다'),'자동 확정 금지 고지 없음');
  assert(!/state:'ROUTE_CHOICE'[\s\S]{0,300}action:\{/.test(src),'ROUTE_CHOICE 가 승인을 냄');
  // 화면도 이 상태를 이름으로 밝힌다(옛날엔 '다음 판단'으로 뭉뚱그렸다).
  assert(read('ord_app.js').includes("ROUTE_CHOICE:'상위 방향 확정 필요'"),'상태 라벨 없음');
});

check('③ 실측 재생 — 두 경로 모두 카드가 채워진다',()=>{
  const R=require('./lib/reconcile_replay.js');
  R.loadEngine();
  // 0723a 는 회복 목표 HOLD 로 8라운드 연속 백지였던 판.
  const a=R.replayDisplayed('0723a',{fromRound:50,toRound:62});
  const emptyA=a.rounds.filter(row=>!row.error&&!row.hasCard&&row.state!=='ROUTE_CHOICE');
  assert.strictEqual(emptyA.length,0,`0723a r50~62 빈 카드 ${emptyA.length}건 (r${emptyA.map(r=>r.round).join(',')})`);
  // 0806a 는 44라운드 내내 ROUTE_CHOICE 였던 판.
  const b=R.replayDisplayed('0806a',{toRound:20});
  const rc=b.rounds.filter(row=>row.state==='ROUTE_CHOICE');
  assert(rc.length>0,'0806a 초반에 ROUTE_CHOICE 가 없음 — 표본이 바뀌었는지 확인 필요');
  const blank=rc.filter(row=>!row.hasCard);
  assert.strictEqual(blank.length,0,`ROUTE_CHOICE 빈 카드 ${blank.length}/${rc.length}건`);
});

console.log(`\n${checks} checks passed (v20.4.0 — 빈 카드 봉합)`);
