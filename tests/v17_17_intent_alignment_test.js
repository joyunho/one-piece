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

test('단계 4(23~30라): 상위 확정 25라부터 + 리롤 게임당 2회(사용자 확인: 항법 시 최대 4회지만 2회 기준)', () => {
  assert(appSource.includes("actualRound()>=25"), '상위 확정 25라 게이트가 사라짐');
  assert(/2\s*-\s*C\.num\(this\.state\.rerollsUsed\)|rerollBudget/.test(appSource + engineSource), '리롤 2회 예산이 사라짐');
  assert(engineSource.includes('리롤 2회'), '리롤 2회 소진 안내가 사라짐');
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

for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}\n  ${error && error.message}`); }
}
console.log(`V17_17_INTENT_ALIGNMENT ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
