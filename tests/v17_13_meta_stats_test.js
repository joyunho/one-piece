'use strict';

// v17.13: 상위권 실측 다이제스트(ord_meta_stats.js) 회귀 테스트.
// 캘리브레이션 원칙을 코드로 고정한다 — 실측 픽률은 (a) 근거 칩 표시,
// (b) clearValue 동률 근처 보조 타이브레이크(로그 스케일, 상한 소폭)로만
// 쓰이고, 게이트·킬 판정·원장 대체에는 절대 쓰이지 않는다.

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
const C = require(path.join(ext, 'ord_core.js'));
require(path.join(ext, 'ord_squad_planner.js'));
require(path.join(ext, 'ord_v15_model.js'));
require(path.join(ext, 'ord_v15_ledger.js'));
require(path.join(ext, 'ord_v15_policy.js'));
const E = require(path.join(ext, 'ord_v15_engine.js'));

const META = global.ORD_META_STATS;
const tests = [];
let failed = 0;
function test(name, fn) { tests.push([name, fn]); }

test('다이제스트 무결성: 스키마·표본 규모·용도 경계', () => {
  assert.strictEqual(META.schema, 'ord-meta-stats-v1');
  assert(META.playerCount >= 30, `상위권 표본이 30명 미만: ${META.playerCount}`);
  assert(META.gameCount >= 10000, `판수 표본이 예상보다 작음: ${META.gameCount}`);
  // 용도 경계는 데이터에 새겨져 있고, 엔진은 softTiebreak===true일 때만 읽는다.
  assert.strictEqual(META.usage.gate, false);
  assert.strictEqual(META.usage.allowKillVerdict, false);
  assert.strictEqual(META.usage.softTiebreak, true);
  assert(Array.isArray(META.caveats) && META.caveats.some(text => /생존 편향/.test(text)),
    '생존 편향(클리어만 기록) 경고가 다이제스트에 없음');
});

test('다이제스트에 개인 식별자 없음(집계 수치만)', () => {
  const raw = fs.readFileSync(path.join(ext, 'ord_meta_stats.js'), 'utf8');
  assert(!/nickname|userId|닉네임/.test(raw), '다이제스트에 플레이어 식별자가 남음');
});

test('byCode 항목은 전부 최소 표본 이상 + upperPairs 참조 무결성', () => {
  const codes = Object.keys(META.byCode);
  assert(codes.length >= 100, `byCode가 예상보다 작음: ${codes.length}`);
  for (const code of codes) {
    assert.strictEqual(code, code.toLowerCase(), `byCode 키가 소문자가 아님: ${code}`);
    assert(META.byCode[code].games >= META.minGames, `최소 표본 미달 항목: ${code}`);
  }
  for (const [upper, pairs] of Object.entries(META.upperPairs)) {
    assert(META.byCode[upper], `upperPairs의 상위 코드가 byCode에 없음: ${upper}`);
    for (const [legend, games] of pairs) {
      assert(META.byCode[legend], `upperPairs의 전설 코드가 byCode에 없음: ${legend}`);
      assert(games >= META.minGames, `동시출현 최소 표본 미달: ${upper}×${legend}`);
    }
  }
});

test('metaEvidence: 코드 조인·대소문자 정규화·부재 시 null', () => {
  const toki = global.ORD_TMO_UNITS.find(unit => (unit.codes || []).some(code => code.toLowerCase() === '780h'));
  assert(toki, '토키(780h)가 카탈로그에 없음');
  const evidence = E._test.metaEvidence(toki);
  assert(evidence && evidence.games > 1000, `토키 실측 판수가 비정상: ${JSON.stringify(evidence)}`);
  assert(evidence.share > 0 && evidence.share < 100);
  // codes가 없는 유닛은 null — 근거 없는 칩을 만들지 않는다.
  assert.strictEqual(E._test.metaEvidence({ codes: [] }), null);
  assert.strictEqual(E._test.metaEvidence(null), null);
});

test('보조 타이브레이크 상한: 최대 표본에서도 0.02 미만·원장 부분점수의 소폭', () => {
  const maxGames = Math.max(...Object.values(META.byCode).map(entry => entry.games));
  const maxBonus = Math.min(0.02, 0.004 * Math.log10(1 + maxGames));
  assert(maxBonus < 0.02, `보너스가 상한에 닿음(로그 스케일 붕괴): ${maxBonus}`);
  // clearValue 가중치 최소축(rareUtil 0.12)의 1/6 이하 — 동률 근처에서만 작동.
  assert(maxBonus <= 0.12 / 6, `보너스가 원장 부분점수 대비 과대: ${maxBonus}`);
});

test('엔진 배선(소스 검증): 캡 상수·deadlineFactor 할인·usage 게이트', () => {
  const engine = fs.readFileSync(path.join(ext, 'ord_v15_engine.js'), 'utf8');
  assert(engine.includes('META_TIEBREAK_CAP=.02'), '타이브레이크 캡 상수가 사라짐');
  assert(/metaBonus=meta\?Math\.min\(META_TIEBREAK_CAP,\.004\*Math\.log10\(1\+meta\.games\)\)\*deadlineFactor:0/.test(engine),
    '로그 스케일 + deadlineFactor 할인 공식이 변경됨');
  assert(engine.includes("usage.softTiebreak!==true)return null"), 'usage.softTiebreak 게이트가 사라짐');
});

test('UI 배선(소스 검증): 근거 칩은 표시 전용', () => {
  const app = fs.readFileSync(path.join(ext, 'ord_app.js'), 'utf8');
  assert(app.includes('상위권 실측 ${C.num(value.metaGames)}판'), '후보 이유줄 실측 칩이 사라짐');
  assert(app.includes('<dt>상위권 실측</dt>'), 'ROUTE_CHOICE 카드 실측 항목이 사라짐');
});

test('데이터 패치 codes: 특수함 3종이 실측 조인 키를 가짐', () => {
  for (const [id, code] of [
    ['unit_1767884457709_1523', 'H50h'],
    ['unit_1767884591387_9300', 'O50h'],
    ['unit_1767884614234_8036', 'P50h']
  ]) {
    const unit = global.ORD_TMO_UNITS.find(row => row.id === id);
    assert(unit, `패치 유닛이 없음: ${id}`);
    assert((unit.codes || []).includes(code), `${unit.name}의 조인 코드 누락: ${code}`);
  }
});

test('실측이 없어도 판단은 동작(모듈 부재 내성)', () => {
  // metaEvidence는 byCode에 없는 코드에서 null을 반환하고, clearValueScore의
  // metaBonus 경로는 null이면 0이 된다.  실존 미등재 코드로 검증한다.
  assert.strictEqual(E._test.metaEvidence({ codes: ['zzzz'] }), null);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}\n  ${error && error.message}`); }
}
console.log(`V17_13_META_STATS ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
