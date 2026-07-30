'use strict';

// v19: 두 번째 상위 — 확정 · 물딜 2상위 · 관성 · 제어 전담 상위 억제.
//
// 0730 클리어 판 뒤 사용자 교정 네 건을 고정한다.
//   ① "2번째 상위를 결정할 때 자꾸 바뀌는게 문제네?" → 관성
//   ② "두번째 상위 확정 이런 버튼이 있으면 좋을듯?"   → 확정
//   ③ "물딜도 2상위 각이 보이면 갈 수 있게"           → 물딜 2상위
//   ④ "아오키지 초월을 해버리면 스턴이 2.5가 엄청 오버" → 제어 전담 억제
//
// 여기서 재는 것은 전부 실측이다.  ④의 근거 숫자(790H vs I90H)는 카탈로그에서
// 직접 읽어 비교하고, ③은 실제로 파티가 2상위로 나오는지를 계획해서 확인한다.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'ord_tmo_auto_extension_v15_0_0_rebuild');
const { loadEngine } = require('./lib/ordlog_replay.js');

loadEngine();
const C = global.ORDCore;
const S = global.ORDSquadPlanner;
const T = S._test;
const CATALOG = global.ORD_TMO_UNITS;
const DB = C.buildDb(CATALOG);

const AOKIJI = '790H';   // (C)아오키지 초월 — 스턴 1.24 · 이감 70 · 딜 없음
const BROOK = 'I90H';    // (B)브룩 초월 — 끝딜 1.5 · 이감 15
const RYOKUGYU = 'LB0H'; // (S)료쿠규 — 물딜 메인 상위
const WHITEBEARD = 'A40h'; // (B)흰수염 — 물딜 두 번째 상위 후보

const tests = [];
let failed = 0;
function test(name, fn) { tests.push([name, fn]); }
function vectorOf(id, mode) { return C.roleContribution(DB.byId.get(id), mode); }

// ── ④ 제어 전담 상위 억제 ───────────────────────────────────────────────
test('main·magicSupport 만으로는 제어 과잉 면제를 받지 못한다', () => {
  const aokiji = vectorOf(AOKIJI, 'magic');
  // 전제 확인: 이 유닛은 제어(스턴·이감)와 증폭만 들고 온다.
  assert(aokiji.main === 1, 'main 부기가 사라졌다면 이 테스트의 전제가 바뀐 것이다');
  assert(aokiji.magicSupport > 0, '폭뎀증이 magicSupport 로 잡히지 않는다');
  assert.strictEqual(Number(aokiji.single) + Number(aokiji.end) + Number(aokiji.subdamage), 0,
    '아오키지 초월에 직접 딜 기여가 생겼다면 근거가 바뀐 것이다');
  assert.strictEqual(T.hasNonControlRole(aokiji), false,
    '제어만 들고 오는 상위가 여전히 과잉 면제를 받는다');

  // 대조군: 브룩은 끝딜 1.5 를 들고 오므로 면제 대상이다.
  const brook = vectorOf(BROOK, 'magic');
  assert(Number(brook.end) > 0, '브룩의 끝딜이 사라졌다면 대조군이 무의미하다');
  assert.strictEqual(T.hasNonControlRole(brook), true, '실제 딜을 들고 오는 상위가 면제를 잃었다');
});

test('제어 전담 상위의 이감 초과분은 부수효과 요율이 아니라 제값으로 계산된다', () => {
  // 이감 목표가 이미 채워진 상태에서 이감 70 을 더 얹는 값.
  //
  // 요율 효과만 떼어 재려면 같은 벡터를 써야 한다 — 상한 초과(capCross)처럼
  // 요율과 무관한 항이 섞이면 유닛끼리의 총액 비교로는 아무것도 증명되지
  // 않는다(첫 시도에서 실제로 이 함정에 걸렸다).  그래서 아오키지 벡터에
  // 실제 딜(end) 한 줄만 얹어 면제 여부만 뒤집고 차이를 본다.
  const requirements = { rows: [{ key: 'slow', label: '이감', current: 120, target: 102, gap: 0 }], route: 'dual' };
  const control = vectorOf(AOKIJI, 'magic');
  const withDamage = Object.assign({}, control, { end: 1.5 });
  assert.strictEqual(T.hasNonControlRole(control), false, '전제: 아오키지는 제어 전담이다');
  assert.strictEqual(T.hasNonControlRole(withDamage), true, '전제: 딜을 얹으면 부수효과가 된다');
  const strict = T.incrementalSlowPenalty(requirements, control);
  const lenient = T.incrementalSlowPenalty(requirements, withDamage);
  assert(strict > lenient,
    `제어 전담 이감 초과가 부수효과와 같은 값으로 계산된다 (전담 ${strict}, 부수 ${lenient})`);
  // 요율 차이는 SLOW_OVERSUPPLY_PENALTY(4) 대 SIDE_SLOW_PENALTY(0.9) — 초과
  // 70%p 에 대해 217%p 만큼의 차이가 나야 한다.
  assert(Math.abs(strict - lenient - 70 * (4 - 0.9)) < 1e-6,
    `요율 차이가 기대값과 다르다 (전담 ${strict}, 부수 ${lenient})`);
});

test('스턴 과잉도 제어 전담이면 제값을 받는다', () => {
  // 스턴 1.5 를 이미 채운 스펙에 1.24 스턴을 더 얹는 값.
  const spec = { stun: 1.5 };
  const aokiji = T.incrementalStunPenalty(spec, vectorOf(AOKIJI, 'magic'));
  assert(aokiji > 400, `제어 전담 상위의 스턴 과잉이 여전히 싸다 (${aokiji})`);
});

// ── ③ 물딜 2상위 ────────────────────────────────────────────────────────
test('물딜 2상위는 확정이 있을 때만 열리고 보드 목표가 함께 줄어든다', () => {
  const base = { mode: 'physical', targetSquadCount: 9, targetLegendEquivalent: 9 };
  assert.strictEqual(T.expectedUpperCount('physical', 'physical', base), 1, '확정 없이 물딜이 2상위를 기대한다');
  assert.strictEqual(T.maxUpperCount('physical', 'physical', base), 1, '확정 없이 물딜 상한이 2로 열렸다');
  assert.strictEqual(T.routeBoardTarget(base, 'physical', 'physical'), 7, '확정 없는 물딜 보드 목표가 7이 아니다');

  const committed = Object.assign({}, base, { secondUpperId: WHITEBEARD });
  assert.strictEqual(T.expectedUpperCount('physical', 'physical', committed), 2, '확정했는데 물딜이 2상위를 기대하지 않는다');
  assert.strictEqual(T.routeBoardTarget(committed, 'physical', 'physical'), 5,
    '2상위인데 보드 목표가 줄지 않아 9환산 계약이 깨진다');

  // 마딜 dual 은 원래 2상위 경로 — 확정과 무관하게 그대로다.
  const magic = { mode: 'magic', targetSquadCount: 9, targetLegendEquivalent: 9 };
  assert.strictEqual(T.expectedUpperCount('magic', 'dual', magic), 2, '마딜 2상위 경로가 1상위로 바뀌었다');
  // 마딜 단끝은 단·끝 자리가 필요해 확정을 세지 않는다.
  assert.strictEqual(T.expectedUpperCount('magic', 'singleEnd', Object.assign({}, magic, { secondUpperId: BROOK })), 1,
    '단끝 경로가 2상위로 열렸다');
});

test('물딜 요구표는 확정이 있을 때만 상위 2기를 요구한다', () => {
  const spec = { main: 1, stun: 1, slow: 60, armor: 180, boss: 1, frenzy: 1 };
  const open = C.clearProfileDetails(spec, 'physical', { gorosei: 'none' });
  const openMain = open.requirements.find(row => row.key === 'main');
  assert.strictEqual(openMain.target, 1, '확정 없는 물딜이 상위 2기를 요구한다');

  const committed = C.clearProfileDetails(spec, 'physical', { gorosei: 'none', secondUpperId: WHITEBEARD });
  const committedMain = committed.requirements.find(row => row.key === 'main');
  assert.strictEqual(committedMain.target, 2, '확정했는데 요구표가 상위 1기만 요구한다');
  assert(/2/.test(committedMain.label), `라벨이 2상위를 알리지 않는다: ${committedMain.label}`);
});

test('확정하면 실제로 물딜 파티가 2상위 · 9환산으로 나온다', () => {
  // 두 번째 상위가 재료·위습 때문에 못 나오는 경우와 구분하려면 넉넉한 패가
  // 필요하다.  흔함 400장 · 위습 600으로 "각이 나오는 판"을 만든다.
  const counts = {};
  for (const unit of DB.units) if (C.isCommon && C.isCommon(unit)) counts[unit.id] = 400;
  counts[C.WISP_ID] = 600;
  counts[RYOKUGYU] = 1;
  const snapshot = {
    source: 'v19-test', sessionId: 'v19', seq: 1, at: 1, dataChangedAt: 1,
    wispCountFound: true, wispCount: counts[C.WISP_ID], counts, currentAbilities: {},
    units: Object.entries(counts).map(([id, count]) => ({ id, count, tmoPercent: 0 }))
  };
  const locks = [{ stage: 'upper', id: RYOKUGYU, source: 'v19-test' }];
  const plan = second => S.planFinalSquad({
    catalog: CATALOG, snapshot, locks,
    settings: { mode: 'physical', magicRoute: 'auto', currentRound: 45, gorosei: 'none', superKumaOwned: true, targetSquadCount: 9, secondUpperId: second }
  });
  const uppersOf = result => (result.finalLineup || [])
    .map(row => row.unit || DB.byId.get(row.id)).filter(unit => unit && C.isUpper(unit));
  const equivalentOf = result => (result.finalLineup || [])
    .reduce((total, row) => { const unit = row.unit || DB.byId.get(row.id); return total + (unit && C.isUpper(unit) ? 3 : 1); }, 0);

  const open = plan('');
  assert.strictEqual(uppersOf(open).length, 1, '확정이 없는데 물딜이 상위 2기를 만든다');
  assert.strictEqual(equivalentOf(open), 9, '기본 물딜이 9환산을 벗어났다');

  const committed = plan(WHITEBEARD);
  const uppers = uppersOf(committed).map(unit => unit.id);
  assert.strictEqual(uppers.length, 2, `확정했는데 물딜 파티가 2상위가 아니다: ${uppers.join(',')}`);
  assert(uppers.includes(WHITEBEARD), `확정한 두 번째 상위가 파티에 없다: ${uppers.join(',')}`);
  assert.strictEqual(equivalentOf(committed), 9, '2상위 파티가 9환산을 벗어났다');
});

// ── ② 확정 = 그 자리를 다른 상위에게 넘기지 않는다 ──────────────────────
test('확정된 두 번째 상위 자리는 다른 상위를 막는다', () => {
  const state = { db: DB };
  const settings = T.withUpperCommitments({ secondUpperId: BROOK }, state, [RYOKUGYU]);
  assert.strictEqual(settings._secondUpperKey, C.canonicalUpperId(BROOK), '확정 키가 만들어지지 않았다');
  assert.strictEqual(T.secondUpperBlocked(settings, DB.byId.get(AOKIJI), [RYOKUGYU], state), true,
    '확정이 있는데 다른 상위가 두 번째 자리를 먹을 수 있다');
  assert.strictEqual(T.secondUpperBlocked(settings, DB.byId.get(BROOK), [RYOKUGYU], state), false,
    '확정한 상위 자신이 막혔다');
  assert.strictEqual(T.secondUpperBlocked(settings, DB.byId.get(RYOKUGYU), [RYOKUGYU], state), false,
    '고정된 메인 상위가 막혔다');
  // 확정이 없으면 아무것도 막지 않는다 — 관성은 순서로만 작동한다.
  const openSettings = T.withUpperCommitments({}, state, [RYOKUGYU]);
  assert.strictEqual(T.secondUpperBlocked(openSettings, DB.byId.get(AOKIJI), [RYOKUGYU], state), false,
    '확정이 없는데 상위가 막힌다');
  // 메인 상위와 같은 계열을 확정으로 받으면 무시한다.
  const sameAsMain = T.withUpperCommitments({ secondUpperId: RYOKUGYU }, state, [RYOKUGYU]);
  assert.strictEqual(sameAsMain._secondUpperKey, '', '메인 상위를 두 번째 상위로 확정해 버렸다');
});

// ── ① 관성 ──────────────────────────────────────────────────────────────
test('관성은 상위에만 붙고 확정·고정된 상위는 대상에서 빠진다', () => {
  const state = { db: DB };
  const settings = T.withUpperCommitments({ stickyUpperIds: [BROOK, AOKIJI, RYOKUGYU], secondUpperId: AOKIJI }, state, [RYOKUGYU]);
  assert.strictEqual(T.stickyUpperHold(state, settings, DB.byId.get(BROOK)), 1, '직전 상위에 관성이 붙지 않는다');
  assert.strictEqual(T.stickyUpperHold(state, settings, DB.byId.get(AOKIJI)), 0, '확정된 상위가 관성에도 중복으로 남았다');
  assert.strictEqual(T.stickyUpperHold(state, settings, DB.byId.get(RYOKUGYU)), 0, '고정된 메인 상위가 관성에 남았다');
  // 상위가 아닌 유닛에는 관성이 없다 — 보조는 싸서 바뀌어도 손실이 없다.
  const support = DB.legendish.find(unit => !C.isUpper(unit));
  assert.strictEqual(T.stickyUpperHold(state, T.withUpperCommitments({ stickyUpperIds: [support.id] }, state, []), support), 0,
    '보조 전설급까지 관성이 붙었다 — 파티 전체가 얼어붙는다');
});

test('관성은 필수 역할 판정 뒤에서만 순서를 바꾼다(비교 순서 계약)', () => {
  const source = fs.readFileSync(path.join(EXT, 'ord_squad_planner.js'), 'utf8');
  const line = source.split('\n').find(row => /return b\.closed-a\.closed.*upperHold/.test(row));
  assert(line, 'compareDraftCandidates 에서 upperHold 를 찾지 못했다');
  const holdAt = line.indexOf('upperHold');
  for (const earlier of ['b.closed-a.closed', 'b.covered-a.covered', 'a.controlPenalty-b.controlPenalty']) {
    assert(line.indexOf(earlier) >= 0 && line.indexOf(earlier) < holdAt,
      `관성이 역할 판정(${earlier})보다 앞에 왔다 — 결손을 더 닫는 후보를 밀어낸다`);
  }
  for (const later of ['compareTierBurn', 'a.wispCost-b.wispCost']) {
    assert(line.indexOf(later) > holdAt,
      `관성이 비용 비교(${later})보다 뒤에 왔다 — "조금 더 싸다"로 상위가 바뀐다`);
  }
});

// ── 앱 배선 ─────────────────────────────────────────────────────────────
test('앱이 확정·관성을 플래너까지 실어 보낸다', () => {
  const app = fs.readFileSync(path.join(EXT, 'ord_app.js'), 'utf8');
  assert(/secondUpperId:''/.test(app), '기본 상태에 secondUpperId 가 없다');
  assert(/secondUpperId:String\(this\.state\.secondUpperId\|\|''\)/.test(app), 'settings 에 확정이 실리지 않는다');
  assert(/stickyUpperIds:\(this\._stickyUpperIds\|\|\[\]\)/.test(app), '관성 힌트가 플래너로 가지 않는다');
  assert(/rememberPlannedUppers\(state,this\._squadCache\)/.test(app), '이번 계획의 상위를 기억하지 않는다');
  assert(/a==='confirm-second-upper'/.test(app), '두 번째 상위 확정 버튼 처리가 없다');
  assert(/a==='release-second-upper'/.test(app), '두 번째 상위 해제 처리가 없다');
  assert(/data-act="confirm-second-upper"/.test(app), '화면에 확정 버튼이 없다');
  assert(/data-act="release-second-upper"/.test(app), '화면에 해제 버튼이 없다');
  // 확정은 캐시를 반드시 무효화해야 한다 — 안 하면 눌러도 아무 일이 없다.
  const handler = app.slice(app.indexOf("a==='confirm-second-upper'"), app.indexOf("a==='release-second-upper'"));
  for (const key of ['_squadCacheKey', '_v15CacheKey', '_directionRankCacheKey', '_blueprintRankingsKey']) {
    assert(handler.includes(key), `확정이 ${key} 를 비우지 않아 화면이 안 바뀐다`);
  }
  const css = fs.readFileSync(path.join(EXT, 'ord_cockpit_v15.css'), 'utf8');
  assert(/\.v153-second\{/.test(css), '두 번째 상위 카드 스타일이 없다');
});

test('상위 순위 캐시 키에 확정·관성이 들어간다', () => {
  const source = fs.readFileSync(path.join(EXT, 'ord_squad_planner.js'), 'utf8');
  const block = source.slice(source.indexOf('function upperRankFingerprint'), source.indexOf('\n}', source.indexOf('function upperRankFingerprint')));
  assert(/secondUpperId/.test(block) && /stickyUpperIds/.test(block),
    '캐시 키에 확정·관성이 없어 눌러도 이전 순위가 돌아온다');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n  ${error && error.message}`); }
}
console.log(`V19_SECOND_UPPER ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
