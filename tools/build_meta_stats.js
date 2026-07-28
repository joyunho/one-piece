#!/usr/bin/env node
// data/tmo_api_histories_*.json(상위권 클리어 기록)에서 실측 통계 다이제스트
// ord_meta_stats.js 를 재생성한다.  재현 빌드 원칙: 같은 입력 → 바이트 동일 출력
// (Date.now 등 비결정 입력 없음, 모든 목록은 정렬 고정).
//
// 다이제스트에는 닉네임을 넣지 않는다 — 집계 수치만.  용도 경계는 데이터에
// 새긴다: 근거 칩 표시 + 동률 근처 보조 타이브레이크 전용, 게이트·킬 판정 금지
// (TMO_랭킹_분석 캘리브레이션 원칙).
//
// 사용: node tools/build_meta_stats.js [입력.json]
//   기본 입력: data/tmo_api_histories_*.json 중 이름순 최신(= 최신 수집일).
//   파일명 정렬 기반이라 커밋된 파일 집합이 같으면 결정적(재현 빌드 유지).

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'ord_tmo_auto_extension_v15_0_0_rebuild');
// v18.1: 기본 입력이 전수 표본(tmo_nightmare_all_*)이다. 상위권 표본만 쓰던
// 시절에는 표본을 키우면 다이제스트 수치가 통째로 커져 엔진 가중치가 조용히
// 바뀌었지만, 이제 엔진이 비율(조건부·픽률)만 읽으므로 표본 크기에 불변이다.
// 전수 파일이 없으면 예전 상위권 표본으로 물러난다.
function latestInput() {
  const dir = path.join(ROOT, 'data');
  const all = fs.readdirSync(dir).filter((name) => /^tmo_nightmare_all_\d{8}\.json(\.gz)?$/.test(name)).sort();
  if (all.length) return path.join(dir, all[all.length - 1]);
  const legacy = fs.readdirSync(dir).filter((name) => /^tmo_api_histories_\d{8}\.json$/.test(name)).sort();
  if (!legacy.length) throw new Error('data/tmo_nightmare_all_*.json(.gz) 이 없습니다 — tools/tmo_nightmare_collect_all.js 먼저 실행');
  return path.join(dir, legacy[legacy.length - 1]);
}
const INPUT = process.argv[2] || latestInput();
function readInput(file) {
  const buf = fs.readFileSync(file);
  return JSON.parse(/\.gz$/.test(file) ? zlib.gunzipSync(buf) : buf);
}
const OUTPUT = path.join(EXT, 'ord_meta_stats.js');

global.window = global;
require(path.join(EXT, 'ord_units_data.js'));
require(path.join(EXT, 'ord_data_patch.js'));

const catByCode = new Map();
for (const u of global.ORD_TMO_UNITS) for (const c of (u.codes || [])) catByCode.set(String(c).toLowerCase(), u);
const groupOf = (code) => {
  const cat = code ? catByCode.get(String(code).toLowerCase()) : null;
  return cat ? String(cat.groupName || '') : '';
};
const isUpperGroup = (g) => /^(제한됨|초월|불멸|영원)/.test(g);
const isLegendishGroup = (g) => /^(전설|히든|왜곡됨|변화된|세라핌|해적선)/.test(g);

const payload = readInput(INPUT);
const games = [];
for (const p of payload.players || []) {
  if (p.error) continue;
  for (const r of p.records || []) if (r.difficulty === '악몽') games.push(r);
}
if (!games.length) throw new Error('악몽 기록이 없습니다: ' + INPUT);

// 유닛별: 등장 판수(같은 판 중복 제거) + 대표 이름(최빈).
const byCode = new Map();
const upperPairCounts = new Map(); // upperCode -> Map(legendCode -> games)
let upperGameTotals = new Map(); // 판당 상위 수 분포
const archetype = new Map();
const partySizes = [];

for (const r of games) {
  const seenCodes = new Set();
  const uppers = new Set(), legends = new Set();
  let upperUnits = 0;
  const tags = new Set();
  let party = 0;
  for (const u of r.units || []) {
    const code = u.code ? String(u.code).toLowerCase() : '';
    party += Number(u.count) || 1;
    if (!code) continue;
    if (!seenCodes.has(code)) {
      seenCodes.add(code);
      let e = byCode.get(code);
      if (!e) byCode.set(code, e = { games: 0, names: new Map() });
      e.games += 1;
      e.names.set(u.name, (e.names.get(u.name) || 0) + 1);
    }
    const g = groupOf(code);
    if (isUpperGroup(g)) {
      uppers.add(code);
      upperUnits += Number(u.count) || 1;
      const tagSrc = g.includes('[') ? g : String(u.name || '');
      if (tagSrc.includes('[마딜]')) tags.add('magic');
      else if (tagSrc.includes('[물딜]')) tags.add('physical');
      else if (tagSrc.includes('[스턴]')) tags.add('stun');
      else tags.add('untagged');
    } else if (isLegendishGroup(g)) {
      legends.add(code);
    }
  }
  partySizes.push(party);
  upperGameTotals.set(upperUnits, (upperGameTotals.get(upperUnits) || 0) + 1);
  const archKey = uppers.size === 0 ? 'none' : [...tags].sort().join('+');
  archetype.set(archKey, (archetype.get(archKey) || 0) + 1);
  for (const up of uppers) {
    let m = upperPairCounts.get(up);
    if (!m) upperPairCounts.set(up, m = new Map());
    for (const lg of legends) m.set(lg, (m.get(lg) || 0) + 1);
  }
}

partySizes.sort((a, b) => a - b);
const q = (p) => partySizes[Math.min(partySizes.length - 1, Math.floor(partySizes.length * p))];

const MIN_GAMES = 10; // 극소 표본은 근거 칩으로 오독될 수 있어 제외
const byCodeOut = {};
for (const code of [...byCode.keys()].sort()) {
  const e = byCode.get(code);
  if (e.games < MIN_GAMES) continue;
  const name = [...e.names.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  // rate = 판당 등장률(0~1). games 는 근거 칩("N판")과 테스트 계약이라 함께 남긴다.
  byCodeOut[code] = { name, games: e.games, rate: Math.round((e.games / games.length) * 10000) / 10000 };
}

// v18.1: 동반은 원시 판수가 아니라 조건부 확률 P(보조|상위)로 싣는다.
//
// 왜 바꿨나 — 원시 판수는 표본 크기에 딸려 다닌다. 표본을 12,035판에서
// 96,627판으로 늘리면 코드 한 줄 안 고쳐도 모든 유닛의 동반 가중치가 일괄
// +0.145 올라, "데이터를 더 모았다"가 "실측이 큐레이션보다 세졌다"가 된다.
// 조건부 확률은 표본이 몇 배가 되든 같은 값이라 그 부작용이 없다.
//
// 정확도도 조건부가 낫다. tools/tmo_backtest.js 로 6월 학습 → 7월 평가한 결과
// (top-8 recall, 전설급 보조 기준):
//   인기순 24.86%  <  현재(동반 판수) 43.62%  <  조건부 44.70%
// 세 번째 원소가 조건부(0~1). 첫 두 원소(코드·판수)는 표시·테스트 계약이라 유지한다.
const upperPairsOut = {};
const upperGamesOut = {};
for (const code of [...upperPairCounts.keys()].sort()) {
  if (!byCodeOut[code]) continue;
  const upperN = byCodeOut[code].games;
  const top = [...upperPairCounts.get(code).entries()]
    .filter(([lg, n]) => n >= MIN_GAMES && byCodeOut[lg])
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 8)
    .map(([lg, n]) => [lg, n, Math.round((n / upperN) * 10000) / 10000]);
  if (top.length) { upperPairsOut[code] = top; upperGamesOut[code] = upperN; }
}

const sortedObj = (m, keyFn) => {
  const out = {};
  for (const k of [...m.keys()].sort(keyFn)) out[String(k)] = m.get(k);
  return out;
};

const digest = {
  schema: 'ord-meta-stats-v1',
  source: path.basename(INPUT),
  collectedAt: payload.collectedAt || null,
  cutoff: payload.cutoff || null,
  playerCount: (payload.players || []).filter((p) => !p.error).length,
  gameCount: games.length,
  minGames: MIN_GAMES,
  // 용도 경계: 실측 픽률은 레시피·DPS 원장 판단을 대체하지 않는다.
  usage: { evidenceChip: true, softTiebreak: true, gate: false, allowKillVerdict: false },
  // 엔진은 비율(byCode.rate, upperPairs 3번째 원소)만 읽는다 — 표본 크기가 바뀌어도
  // 가중치가 흔들리지 않게 하는 계약. 원시 판수는 근거 칩 표시용으로만 남는다.
  rateBased: true,
  caveats: [
    '클리어된 판만 기록됨(실패 판 없음) — 생존 편향',
    '최종 파티만 있고 판 중간의 패·판단 과정은 없음',
    '파밍 판(잔존 26기+)이 섞여 있음',
  ],
  partySize: { median: q(0.5), p10: q(0.1), p90: q(0.9) },
  upperCountDist: sortedObj(upperGameTotals, (a, b) => a - b),
  archetype: sortedObj(archetype),
  byCode: byCodeOut,
  upperGames: upperGamesOut, // 조건부 확률의 분모 — 검산·재계산용
  upperPairs: upperPairsOut,
};

const body = 'window.ORD_META_STATS=' + JSON.stringify(digest) + ';\n';
fs.writeFileSync(OUTPUT, body);
console.log(`ord_meta_stats.js 생성: ${digest.playerCount}명 ${digest.gameCount}판, byCode ${Object.keys(byCodeOut).length}종, ${(body.length / 1024).toFixed(1)}KB`);
