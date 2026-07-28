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

test('v18.1 표본 크기 불변: 다이제스트가 비율을 싣는다', () => {
  assert.strictEqual(META.rateBased, true, '비율 기반 표시가 없음 — 엔진이 판수를 읽을 위험');
  for (const [code, entry] of Object.entries(META.byCode)) {
    assert(typeof entry.rate === 'number' && entry.rate > 0 && entry.rate <= 1,
      `픽률이 0~1 범위가 아님: ${code} ${entry.rate}`);
    // rate 는 games/gameCount 와 일치해야 한다(반올림 오차 허용).
    assert(Math.abs(entry.rate - entry.games / META.gameCount) < 1e-3,
      `픽률과 판수가 어긋남: ${code}`);
  }
  const uppers = Object.keys(META.upperPairs);
  assert(uppers.length > 0, 'upperPairs가 비어 있음');
  for (const upper of uppers) {
    const upperN = META.upperGames[upper];
    assert(upperN > 0, `조건부 분모(upperGames)가 없음: ${upper}`);
    for (const entry of META.upperPairs[upper]) {
      // v18.1: [코드, 동반판수, 조건부확률, 신뢰구간반폭%p]
      assert.strictEqual(entry.length, 4, `동반 원소가 4원소가 아님: ${upper}`);
      const [, games, cond, ci] = entry;
      assert(typeof ci === 'number' && ci >= 0, `동반 신뢰구간이 없음: ${upper}`);
      assert(cond > 0 && cond <= 1, `조건부 확률이 0~1 범위가 아님: ${upper} ${cond}`);
      assert(Math.abs(cond - games / upperN) < 1e-3, `조건부가 판수/상위판수와 어긋남: ${upper}`);
    }
  }
});

test('v18.1 신뢰구간: 표본이 얇을수록 넓다(하드컷 대신 불확실성 표시)', () => {
  for (const [code, entry] of Object.entries(META.byCode)) {
    assert(typeof entry.ci === 'number' && entry.ci >= 0, `신뢰구간이 없음: ${code}`);
  }
  // 동반 신뢰구간의 분모는 상위 판수라 상위별로 크게 다르다 — 얇은 상위가 더 넓어야 한다.
  const widths = Object.entries(META.upperPairs).map(([upper, pairs]) => ({
    n: META.upperGames[upper],
    ci: Math.max(...pairs.map(p => p[3])),
  })).filter(row => row.n > 0);
  assert(widths.length >= 5, '동반 표본이 너무 적어 검증 불가');
  widths.sort((a, b) => a.n - b.n);
  const thin = widths[0], thick = widths[widths.length - 1];
  assert(thin.ci > thick.ci,
    `얇은 표본(${thin.n}판, ±${thin.ci}p)이 두꺼운 표본(${thick.n}판, ±${thick.ci}p)보다 넓어야 함`);
  // 순위는 점추정을 쓴다 — Wilson 하한을 순위 키로 바꾸면 백테스트가 나빠졌다(44.67 vs 44.70).
  const planner = fs.readFileSync(path.join(ext, 'ord_squad_planner.js'), 'utf8');
  assert(!/wilson/i.test(planner), '플래너가 신뢰구간을 순위 키로 쓰면 안 됨 — 표시 전용');
});

test('v18.1 노후 경보: 경과 개월과 예상 이동폭을 돌려준다', () => {
  assert(META.drift, '드리프트 블록이 없음');
  assert(Array.isArray(META.drift.months) && META.drift.months.length === 2, '비교 대상 두 달이 없음');
  assert(META.drift.meanAbsShift > 0, '월 평균 픽률 이동폭이 없음');
  assert(META.drift.staleAfterMonths > 0, '노후 기준 개월이 없음');
  const collected = Date.parse(META.collectedAt);
  const fresh = E.metaStaleness(collected + 24 * 3600 * 1000);
  assert(fresh && fresh.stale === false, `수집 직후는 낡지 않아야 함: ${JSON.stringify(fresh)}`);
  const old = E.metaStaleness(collected + (META.drift.staleAfterMonths + 1) * 31 * 24 * 3600 * 1000);
  assert(old && old.stale === true, `기준 개월을 넘기면 낡아야 함: ${JSON.stringify(old)}`);
  assert(old.expectedShift > fresh.expectedShift, '예상 이동폭이 시간에 따라 커져야 함');
  // 앱이 그 경보를 실제로 표시하는지(소스 검증).
  const app = fs.readFileSync(path.join(ext, 'ord_app.js'), 'utf8');
  assert(app.includes('metaStaleness'), '앱이 노후 경보를 읽지 않음');
  assert(app.includes('재수집 권고'), '노후 경보 문구가 없음');
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
  // v18.1: 엔진이 실제로 쓰는 식(픽률 × 기준 판수)으로 검증한다. 판수를 그대로
  // 넣으면 표본이 커질수록 보너스가 오르는 옛 식을 테스트하게 된다.
  const maxRate = Math.max(...Object.values(META.byCode).map(entry => entry.rate));
  const maxBonus = Math.min(0.02, 0.004 * Math.log10(1 + maxRate * 12035));
  assert(maxBonus < 0.02, `보너스가 상한에 닿음(로그 스케일 붕괴): ${maxBonus}`);
  // clearValue 가중치 최소축(rareUtil 0.12)의 1/6 이하 — 동률 근처에서만 작동.
  assert(maxBonus <= 0.12 / 6, `보너스가 원장 부분점수 대비 과대: ${maxBonus}`);
});

test('엔진 배선(소스 검증): 캡 상수·deadlineFactor 할인·usage 게이트', () => {
  const engine = fs.readFileSync(path.join(ext, 'ord_v15_engine.js'), 'utf8');
  assert(engine.includes('META_TIEBREAK_CAP=.02'), '타이브레이크 캡 상수가 사라짐');
  // v18.1: 표본 크기 불변성 — 판수(meta.games)가 아니라 픽률(meta.rate)을 쓴다.
  // 판수를 쓰면 데이터를 더 모으는 것만으로 실측 가중치가 올라간다(코드 변경 없이).
  assert(engine.includes('META_REF_GAMES=12035'), '픽률 환산 기준 상수가 사라짐');
  assert(/metaBonus=meta\?Math\.min\(META_TIEBREAK_CAP,\.004\*Math\.log10\(1\+meta\.rate\*META_REF_GAMES\)\)\*deadlineFactor:0/.test(engine),
    '로그 스케일 + deadlineFactor 할인 공식이 변경됨');
  assert(!/Math\.log10\(1\+meta\.games\)/.test(engine), '판수 기반 보너스가 남아 있음 — 표본 크기에 딸려 간다');
  assert(engine.includes("usage.softTiebreak!==true)return null"), 'usage.softTiebreak 게이트가 사라짐');
});

test('UI 배선(소스 검증): 근거 칩은 표시 전용', () => {
  const app = fs.readFileSync(path.join(ext, 'ord_app.js'), 'utf8');
  // v18.1: 표본이 상위권 55인 → 전수라 라벨도 '전체 실측'.
  assert(app.includes('전체 실측 ${C.num(value.metaGames)}판'), '후보 이유줄 실측 칩이 사라짐');
  assert(app.includes('<dt>전체 실측</dt>'), 'ROUTE_CHOICE 카드 실측 항목이 사라짐');
  assert(!app.includes('상위권 실측'), '표본이 전수인데 상위권 라벨이 남아 있음');
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
