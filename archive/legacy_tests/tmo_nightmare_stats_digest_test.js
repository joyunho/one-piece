'use strict';

// 악몽 클리어 전수 통계 다이제스트(data/tmo_nightmare_stats_*.json) 회귀 테스트.
//
// 이 다이제스트는 확장에 번들되지 않는 분석 산출물이다. 그래서 검사하는 건
// 엔진 계약이 아니라 "통계가 스스로를 오독하게 만들지 않는가"이다:
//   - 표본 규모와 커버리지가 전수라고 부를 만한가
//   - 비율 합이 맞는가(판 단위 분류는 서로 배타적이어야 한다)
//   - 생존 편향·정의 미확인 항목이 경고 없이 지표로 둔갑하지 않았는가

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const names = fs.readdirSync(dataDir).filter((n) => /^tmo_nightmare_stats_\d{8}\.json$/.test(n)).sort();
if (!names.length) {
  console.log('SKIP tmo_nightmare_stats: data/tmo_nightmare_stats_*.json 없음 — tools/tmo_nightmare_stats.js 먼저 실행');
  process.exit(0);
}
const D = JSON.parse(fs.readFileSync(path.join(dataDir, names[names.length - 1]), 'utf8'));

const tests = [];
let failed = 0;
function test(name, fn) { tests.push([name, fn]); }

test('스키마·표본 규모', () => {
  assert.strictEqual(D.schema, 'tmo-nightmare-stats-v1');
  // 전수 수집이므로 상위권 표본(수십 명)과는 자릿수가 다르다.
  assert(D.sample.playersWithGames >= 1000, `전수라기엔 플레이어가 적음: ${D.sample.playersWithGames}`);
  assert(D.sample.games >= 50000, `전수라기엔 판수가 적음: ${D.sample.games}`);
  assert.strictEqual(D.sample.truncatedPlayers, 0, '페이지 상한에서 절단된 플레이어가 있다 — 상한을 올려 재수집할 것');
  assert.strictEqual(D.sample.droppedBeforeCutoff, 0, '컷오프 이전 판이 수집물에 섞여 있다');
});

test('컷오프가 6/6 KST 이후로 지켜졌다', () => {
  const cutoffMs = Date.parse(D.cutoff);
  assert(Number.isFinite(cutoffMs), `컷오프 파싱 실패: ${D.cutoff}`);
  const firstDay = D.sample.dayRange[0];
  assert(firstDay >= '2026-06-06', `컷오프 이전 날짜가 표본에 있음: ${firstDay}`);
});

test('커버리지: 컷오프가 끼지 않은 달은 랭킹 총량을 거의 다 받았다', () => {
  assert(D.coverage, '커버리지 대조가 없다 — 수집기가 seasonClears를 남기지 않았다');
  const cutoffMs = Date.parse(D.cutoff);
  for (const [month, c] of Object.entries(D.coverage)) {
    // 달 전체가 컷오프 이후인 달만 100% 기대. 컷오프가 낀 달은 낮은 게 정상.
    if (Date.parse(`${month}-01T00:00:00Z`) < cutoffMs) continue;
    assert(c.rate >= 95, `${month} 커버리지가 낮음: ${c.rate}% (${c.collected}/${c.rankingClears})`);
  }
});

test('판 단위 분류는 배타적이고 합이 100%', () => {
  const archSum = Object.values(D.archetype).reduce((a, x) => a + x.games, 0);
  assert.strictEqual(archSum, D.sample.games, `아키타입 합계 ${archSum} ≠ 판수 ${D.sample.games}`);
  const upperSum = Object.values(D.upperCountDist).reduce((a, x) => a + x, 0);
  assert.strictEqual(upperSum, D.sample.games, `판당 상위 수 분포 합계 ${upperSum} ≠ 판수 ${D.sample.games}`);
  const daySum = Object.values(D.byDay).reduce((a, x) => a + x, 0);
  assert.strictEqual(daySum, D.sample.games, `일자별 합계 ${daySum} ≠ 판수 ${D.sample.games}`);
  const hourSum = Object.values(D.byHourKst).reduce((a, x) => a + x, 0);
  assert.strictEqual(hourSum, D.sample.games, `시간대 합계 ${hourSum} ≠ 판수 ${D.sample.games}`);
});

test('픽률은 판 단위 등장률이라 100%를 넘지 않는다', () => {
  for (const row of [...D.topUnitsOverall, ...D.topUpper, ...D.topLegendish]) {
    assert(row.rate > 0 && row.rate <= 100, `픽률 범위 이탈: ${row.name} ${row.rate}%`);
    assert(row.games >= D.minGamesForUnitTable, `최소 표본 미만이 표에 올라옴: ${row.name} ${row.games}판`);
    assert(row.games <= D.sample.games, `등장 판수가 전체 판수를 넘음: ${row.name}`);
  }
});

test('생존 편향·정의 미확인 경고가 살아 있다', () => {
  assert(Array.isArray(D.caveats) && D.caveats.some((t) => /생존 편향/.test(t)),
    '생존 편향(클리어만 기록) 경고가 다이제스트에 없음');
  // nightmare-score는 수십 vs 수만 두 규모가 섞여 있다. 하나로 뭉뚱그린 중앙값만
  // 남으면 지표로 오용되므로 규모 분리가 유지되는지 고정한다.
  assert(D.score && D.score.small && D.score.big, 'score 규모 분리가 사라졌다');
  assert(D.score.small.n + D.score.big.n <= D.sample.games, 'score 표본이 판수를 초과');
  if (D.score.big.n > 0) {
    assert(D.score.big.median > D.score.bigThreshold, '대규모 점수 분리 기준이 어긋남');
  }
});

test('층위 합계가 전체와 일치(표본 편향 점검이 성립하려면)', () => {
  const t = D.tiers;
  const games = Object.values(t).reduce((a, x) => a + x.games, 0);
  const players = Object.values(t).reduce((a, x) => a + x.players, 0);
  assert.strictEqual(games, D.sample.games, `층위 판수 합계 ${games} ≠ ${D.sample.games}`);
  assert.strictEqual(players, D.sample.playersWithGames, `층위 인원 합계 ${players} ≠ ${D.sample.playersWithGames}`);
});

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}: ${error.message}`);
  }
}
console.log(`\ntmo_nightmare_stats_digest: ${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
