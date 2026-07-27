'use strict';

// v17.14: 미리 파티 모달의 "실측 동반 전설급" 표시 + 수집기 시즌 자동 산출.
// 계약: metaPairs는 표시 전용 — 순위·게이트·파티 구성 계산에 관여하지 않는다.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ext = path.join(__dirname, '../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window = global;
require(path.join(ext, 'ord_units_data.js'));
require(path.join(ext, 'ord_upper_memo.js'));
require(path.join(ext, 'ord_synergy_memo.js'));
require(path.join(ext, 'ord_data_patch.js'));
require(path.join(ext, 'ord_story_nonupper_data.js'));
require(path.join(ext, 'ord_story_upper_data.js'));
require(path.join(ext, 'ord_upper_combat_data.js'));
require(path.join(ext, 'ord_upper_skill_digest.js'));
require(path.join(ext, 'ord_upper_skill_dps.js'));
require(path.join(ext, 'ord_meta_stats.js'));
require(path.join(ext, 'ord_core.js'));
require(path.join(ext, 'ord_squad_planner.js'));
require(path.join(ext, 'ord_v15_model.js'));
require(path.join(ext, 'ord_v15_ledger.js'));
require(path.join(ext, 'ord_v15_policy.js'));
const E = require(path.join(ext, 'ord_v15_engine.js'));
const { seasonsSince } = require(path.join(__dirname, '../tools/tmo_api_collect.js'));

const META = global.ORD_META_STATS;
const tests = [];
let failed = 0;
function test(name, fn) { tests.push([name, fn]); }

test('metaPairs 공개 API: 변신 코드 중 표본 최대 코드의 동반 목록을 이름으로 반환', () => {
  assert.strictEqual(typeof E.metaPairs, 'function', 'metaPairs가 공개 API가 아님');
  // 몬스터포인트 쵸파: codes에 기본형 190H + 변신형 390H(표본 147판, 더 큼).
  const chopper = global.ORD_TMO_UNITS.find(unit => unit.id === 'unit_1747756917990_920');
  assert(chopper && (chopper.codes || []).includes('390H'), '쵸파 몬스터포인트 코드 패치가 사라짐');
  const evidence = E.metaPairs(chopper);
  assert(evidence, '쵸파 몬스터포인트 실측 동반 목록이 비어 있음');
  assert.strictEqual(evidence.games, META.byCode['390h'].games, '표본이 더 큰 변신 코드를 선택해야 함');
  assert(evidence.pairs.length >= 1 && evidence.pairs.length <= 8);
  for (const pair of evidence.pairs) {
    assert(pair.name && !/^[0-9a-z]{4}$/i.test(pair.name), `동반 유닛이 코드 그대로 노출됨: ${pair.name}`);
    assert(pair.games >= META.minGames);
  }
});

test('metaPairs: 실측 없는 유닛·상위 아닌 유닛은 null', () => {
  assert.strictEqual(E.metaPairs({ codes: ['zzzz'] }), null);
  assert.strictEqual(E.metaPairs(null), null);
  // 전설급(상위 아님)은 upperPairs 키가 없으므로 null — 토키로 확인.
  const toki = global.ORD_TMO_UNITS.find(unit => (unit.codes || []).some(code => code.toLowerCase() === '780h'));
  assert.strictEqual(E.metaPairs(toki), null, '전설급이 upperPairs를 반환하면 안 됨');
});

test('표시 전용 계약: 앱은 렌더에서만 metaPairs를 호출하고 플래너·결정에는 안 쓴다', () => {
  const app = fs.readFileSync(path.join(ext, 'ord_app.js'), 'utf8');
  const calls = app.match(/metaPairs\(/g) || [];
  assert.strictEqual(calls.length, 1, `metaPairs 호출이 렌더 1곳이어야 함: ${calls.length}곳`);
  assert(app.includes('renderV151MetaPairs(state,unit)'), '미리 파티 모달 배선이 사라짐');
  assert(app.includes('v151-meta-pairs'), '실측 동반 전설 스트립 클래스가 사라짐');
  // v17.17 계약 개정: 플래너도 실측을 "유계 타이브레이크"로만 쓸 수 있다.
  // 여전히 금지: 동반 목록(metaPairs) 사용, 게이트·임계 비교, 점수 가산.
  const planner = fs.readFileSync(path.join(ext, 'ord_squad_planner.js'), 'utf8');
  assert(!planner.includes('metaPairs'), '플래너가 동반 실측(metaPairs)을 참조하면 안 됨');
  assert(planner.includes('usage.softTiebreak!==true)return 0'), '플래너 실측 참조에 softTiebreak 게이트가 없음');
  assert(!/metaGamesOf\([^)]*\)\s*[<>]=?\s*\d/.test(planner), '실측이 임계 게이트로 쓰이면 안 됨 — 정렬 꼬리 전용');
  assert((planner.match(/metaGamesOf\(/g) || []).length <= 2, '플래너의 실측 참조 지점이 과다');
});

test('CSS: 미리 파티 실측 스트립 스타일 존재', () => {
  const css = fs.readFileSync(path.join(ext, 'ord_cockpit_v15.css'), 'utf8');
  assert(css.includes('.party-modal .v151-meta-pairs'), '실측 스트립 스타일이 사라짐');
});

test('수집기 시즌 자동 산출: 컷오프 달~실행 달, 연도 경계 포함', () => {
  assert.deepStrictEqual(seasonsSince('2026-06-04T15:00:00Z', Date.parse('2026-07-25T12:00:00Z')), ['2026-06', '2026-07']);
  assert.deepStrictEqual(seasonsSince('2026-06-04T15:00:00Z', Date.parse('2026-06-10T00:00:00Z')), ['2026-06']);
  assert.deepStrictEqual(seasonsSince('2026-11-15T00:00:00Z', Date.parse('2027-01-03T00:00:00Z')), ['2026-11', '2026-12', '2027-01']);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}\n  ${error && error.message}`); }
}
console.log(`V17_14_META_PAIRS ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
