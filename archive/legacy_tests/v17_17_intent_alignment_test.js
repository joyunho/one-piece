'use strict';

// v17.17: 사용자 운영 의도 정합 계약 (2026-07-27 사용자 확인 사실 기반).
// 사용자가 기술한 8단계 운영이 엔진 동작과 어긋나면 여기서 깨진다.
//  1(~7라) 첫 희귀·랜덤 위습 2/라·152 예정 특별함 / 2(~19라) 첫 전설=계통
//  3(20~22) 보상·도박은 관측 반영 / 4(23~30) 상위 선택·희귀 소진·리롤 2회
//  5(30~40) 무위습 보강 우선 / 6(41~50) 선위 제한 제작·9환산(상위×3)
//  7(50라) 판매·털기 / 8(51~65) 버티기 — 킬 판정은 하지 않음.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ext = path.join(__dirname, '../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window = global;
for (const file of ['ord_units_data.js', 'ord_upper_memo.js', 'ord_synergy_memo.js', 'ord_data_patch.js',
  'ord_story_nonupper_data.js', 'ord_story_upper_data.js', 'ord_upper_combat_data.js',
  'ord_upper_skill_digest.js', 'ord_upper_skill_dps.js', 'ord_meta_stats.js', 'ord_core.js']) {
  require(path.join(ext, file));
}
const C = global.ORDCore;
const engineSource = fs.readFileSync(path.join(ext, 'ord_v15_engine.js'), 'utf8');
const appSource = fs.readFileSync(path.join(ext, 'ord_app.js'), 'utf8');

const tests = [];
let failed = 0;
function test(name, fn) { tests.push([name, fn]); }

test('단계 1(~7라): 첫 희귀 마감 7라 + 랜덤 흔함 위습 2/라(9종) 모델', () => {
  const phase = C.phaseForRound(5);
  assert.strictEqual(phase.key, 'rare');
  assert.strictEqual(C.RANDOM_WISP_PER_ROUND, 2, '라운드당 랜덤 위습 2개(맵 사실)');
  assert.strictEqual(C.COMMON_KIND_COUNT, 9, '흔함 9종 균등 가정');
  assert.strictEqual(C.SELECTION_WISP_INCOME_PER_ROUND, 0.5, '선택 위습 실측 0.5/라(참고 전용)');
});

test('단계 1: 152킬 예정 특별함 — 사용자 선택을 가상 재료로 반영, 압살롬 제외', () => {
  const eligible = C.eligible152Specials(C.buildDb(global.ORD_TMO_UNITS));
  assert(eligible.length >= 30, `152 자격 특별함 풀이 비정상: ${eligible.length}`);
  assert(!eligible.some(unit => /압살롬/.test(unit.name)), '압살롬은 152 자격에서 제외');
  const model = fs.readFileSync(path.join(ext, 'ord_v15_model.js'), 'utf8');
  assert(model.includes('virtualSpecial'), '가상 152 특별함 반영이 사라짐');
});

test('단계 2(~19라): 첫 전설 마감 20라 + 첫 전설 계열이 물딜/마딜 방향 결정', () => {
  assert.strictEqual(C.phaseForRound(15).key, 'story');
  assert(appSource.includes('v151FamilyIntent'), '첫 전설 계열 기반 방향 추론이 사라짐');
});

test('단계 3(20~22라): 보상·도박 유입은 예측하지 않고 관측 후 반영(미래 무신용)', () => {
  // 상위 결정 단계 정의가 "보상 유입 후 전체 패"를 전제한다.
  assert.strictEqual(C.phaseForRound(23).key, 'route');
  assert(engineSource.includes('futureDropsCredited:false'), '미래 드랍 무신용 원칙이 사라짐');
});

test('단계 4(23~30라): 상위 확정은 라운드 무관(v22.1) + 리롤 게임당 2회(사용자 확인: 항법 시 최대 4회지만 2회 기준)', () => {
  // v22.1(사용자: "25라전에 확정안되는거 풀어" · 0809 포렌식): 확정 25라
  // 게이트는 제거됐다 — 일찍 확정할수록 마일스톤 견적이 확정 상위 트리
  // 재료를 보호한다.  25라 비교는 리롤 게이트만 남는다.
  assert(!appSource.includes('방향 확정은 25라운드부터'), '확정 게이트 문구가 되살아남');
  // v23.6 재핀(사용자 지시 "리스크헷지 기준으로 리롤 추천 더 적극적으로"):
  // 리롤 게이트는 고정 25라가 아니라 항법 의존 — 기본 25라 유지, 적극
  // 리롤 항법(리스크헷지·카지노) + 상위 확정이면 18라 개방.
  // v24.3 재핀: 확정 시 즉시 개방 · 미확정 25라 게이트.
  assert(appSource.includes('rerollGateRound=this.upperLock()?0:25'), '리롤 게이트(확정 즉시·미확정 25라)가 사라짐');
  assert(appSource.includes('${rerollGateRound}라 전 리롤 잠금'), '리롤 잠금 사유가 게이트 라운드를 안 따라간다');
  assert(/2\s*-\s*C\.num\(this\.state\.rerollsUsed\)|rerollBudget/.test(appSource + engineSource), '리롤 2회 예산이 사라짐');
  // v23.0 재핀: 소진 안내가 항법 의존 상한으로 보간된다(`리롤 ${rerollLimit}회`).
  assert(/리롤 \$\{rerollLimit\}회|리롤 2회/.test(engineSource), '리롤 소진 안내가 사라짐');
});

test('단계 4: 상위 선택은 빠른 도달과 패 소모·보완의 균형(클리어 가치 랭킹)', () => {
  assert(engineSource.includes('deadlineFactor'), '도달 시점 할인이 사라짐');
  assert(engineSource.includes('rareUtil'), '희귀 활용률 축이 사라짐');
});

test('단계 5(30~40라): 선택위습 0 비용 무회귀 보강은 즉시 승인', () => {
  assert(engineSource.includes('freeNonRegressiveRepair'), '무위습 보강 우선 규칙이 사라짐');
});

test('단계 6(41~50라): 선위 하드컷 23·선호 10 초과 시 차선책 심사 + 9환산(상위×3)', () => {
  assert.strictEqual(C.MAX_WISP_COST, 23);
  assert.strictEqual(C.PREFERRED_WISP_COST, 10);
  const state = C.normalizeState(global.ORD_TMO_UNITS, {}, {});
  const upper = state.db.uppers.find(unit => C.num(state.counts[unit.id]) === 0);
  state.counts[upper.id] = 1;
  assert.strictEqual(C.progressionCounts(state).squad, 3, '상위 1기 = 전설 3환산');
});

test('단계 7(50라): 판매·털기 단계 안내 + 50라+ 화력 업그레이드 비보류', () => {
  assert(/판매·업그레이드·컨트롤|판매 후 최종 전설급만/.test(fs.readFileSync(path.join(ext, 'ord_core.js'), 'utf8')), '판매 단계 안내가 사라짐');
  assert(engineSource.includes('firepowerUpgrade'), '50라+ 화력 업그레이드 승인 규칙이 사라짐');
});

test('단계 8(51~65라): 중간 마감 분할 + 킬 판정은 의도적으로 하지 않음', () => {
  assert.strictEqual(C.phaseForRound(55).key, 'finish');
  const policy = fs.readFileSync(path.join(ext, 'ord_v15_policy.js'), 'utf8');
  assert(/55|60|65/.test(policy), '51~65 중간 마감 분할이 사라짐');
  assert(global.ORD_META_STATS.usage.allowKillVerdict === false, '킬 판정 금지 경계가 사라짐');
});

test('파티 추천 클리어 지향(v17.18 교정): 스토리 아님 — 기준 상위 동반 실측 우선', () => {
  require(path.join(ext, 'ord_squad_planner.js'));
  const planner = global.ORDSquadPlanner;
  const aff = planner._test.clearAffinity, cmp = planner._test.compareAffinity;
  const setCtx = planner._test.setAffinityContext, pairGames = planner._test.pairGamesOf;
  const db = C.buildDb(global.ORD_TMO_UNITS);
  const toki = global.ORD_TMO_UNITS.find(unit => (unit.codes || []).some(code => code.toLowerCase() === '780h'));
  // v18.1: 동반 성분의 단위가 판수 → 조건부 확률 P(보조|상위)로 바뀌었다.
  // 컨텍스트 없음: 동반 신호 0 — 전체 픽률로만 줄 세우는 대체값(동반 있는
  // 후보보다 반드시 아래). 스토리 무관은 그대로.
  setCtx([]);
  const noCtx = aff(toki);
  assert(noCtx > 0 && noCtx < 0.01, `컨텍스트 없음 = 미관측 대체값(동반 후보보다 아래): ${noCtx}`);
  const storyOnly = { id: 'story-only-fixture', codes: [] };
  assert.strictEqual(aff(storyOnly), 0, '실측 없는 유닛은 0 — 스토리 랭크는 최종 파티 기준이 아님');
  // 컨텍스트(영원 비비): 비비 판의 82.7%에 토키가 있다 — 동반 성분이 주도.
  const vivi = global.ORD_TMO_UNITS.find(unit => /^\(?.?\)?비비/.test(unit.name) && /^영원/.test(unit.groupName || ''));
  assert(vivi, '영원 비비 픽스처 없음');
  setCtx([vivi]);
  const cond = pairGames(toki);
  assert(cond > 0.5 && cond <= 1, `비비 컨텍스트에서 토키 동반 조건부가 커야 함: ${cond}`);
  const withCtx = aff(toki);
  assert(withCtx > noCtx, `동반 컨텍스트가 affinity를 올려야 함: ${withCtx} vs ${noCtx}`);
  assert(withCtx <= 1, `유계 이탈: ${withCtx}`);
  // v18.1: 전수 표본이라 전설급은 전부 픽률을 갖는다(예전엔 실측 0인 유닛이 있었다).
  // 그래서 "동반 신호가 없는" 유닛을 약자로 잡는다 — 대체값 구간에 머물러야 한다.
  const weak = db.legendish.find(unit => pairGames(unit) === 0);
  assert(weak, '동반 신호 없는 전설급 픽스처가 없음');
  assert(cmp(toki, weak) < 0, '동반 우위 유닛이 앞서야 함');
  assert(aff(weak) < aff(toki), `대체값이 동반 성분을 넘어서면 안 됨: ${aff(weak)} vs ${aff(toki)}`);
  setCtx([]);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}\n  ${error && error.message}`); }
}
console.log(`V17_17_INTENT_ALIGNMENT ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
