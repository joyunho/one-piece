#!/usr/bin/env node
// 전수 악몽 클리어 기록에서 "상위 유닛 → 함께 쓰인 보조" 표를 만든다.
//
// 기존 ord_meta_stats.js 의 upperPairs 는 동반 판수(raw count)만 담는다. 그러면
// 어디서나 많이 쓰이는 유닛(토키·모비딕호 같은 범용 픽)이 모든 상위의 동반
// 1위를 차지해 "이 상위와 특별히 잘 맞는 보조"를 못 가린다.
//
// 그래서 두 값을 함께 낸다:
//   conditional  P(보조 | 상위)  — 그 상위를 쓴 판에서 이 보조가 나온 비율
//   lift         P(보조 | 상위) / P(보조)  — 전체 평균 대비 몇 배 더 붙는가
// lift 가 1.0 근처면 "그냥 원래 많이 쓰는 유닛", 1.5 이상이면 그 상위 쪽에
// 유의미하게 쏠린 조합이다.
//
// 사용: node --max-old-space-size=8192 tools/tmo_upper_pairs.js [입력.json(.gz)]

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'ord_tmo_auto_extension_v15_0_0_rebuild');

function readJson(file) {
  const buf = fs.readFileSync(file);
  return JSON.parse(/\.gz$/.test(file) ? zlib.gunzipSync(buf) : buf);
}
function latestInput() {
  const dir = path.join(ROOT, 'data');
  const names = fs.readdirSync(dir).filter((n) => /^tmo_nightmare_all_\d{8}\.json(\.gz)?$/.test(n)).sort();
  if (!names.length) throw new Error('data/tmo_nightmare_all_*.json(.gz) 이 없습니다');
  return path.join(dir, names[names.length - 1]);
}
const INPUT = process.argv[2] || latestInput();

global.window = global;
require(path.join(EXT, 'ord_units_data.js'));
require(path.join(EXT, 'ord_data_patch.js'));
const catByCode = new Map();
for (const u of global.ORD_TMO_UNITS) for (const c of (u.codes || [])) catByCode.set(String(c).toLowerCase(), u);
const groupOf = (code) => {
  const cat = catByCode.get(String(code).toLowerCase());
  return cat ? String(cat.groupName || '') : '';
};
const cleanGroup = (g) => String(g).split(/\s{2,}/)[0].trim();
const isUpper = (g) => /^(제한됨|초월|불멸|영원)/.test(g);

// 최소 표본: 상위는 이보다 적게 등장하면 표를 만들지 않고, 동반 보조도
// 이보다 적게 겹치면 싣지 않는다(꼬리 노이즈가 lift 를 크게 흔든다).
const MIN_UPPER_GAMES = 100;
const MIN_PAIR_GAMES = 20;
const TOP_PAIRS = 12;

const payload = readJson(INPUT);
const games = [];
for (const p of payload.players || []) {
  if (p.error) continue;
  for (const r of p.records || []) if (r.difficulty === '악몽') games.push(r);
}
if (!games.length) throw new Error('악몽 기록이 없습니다: ' + INPUT);

const nameOf = new Map();
const unitGames = new Map();          // code -> 등장 판수(전체)
const upperGames = new Map();         // upperCode -> 등장 판수
const pairCounts = new Map();         // upperCode -> Map(otherCode -> 동반 판수)

for (const r of games) {
  const codes = new Set();
  for (const u of r.units || []) {
    const code = u.code ? String(u.code).toLowerCase() : '';
    if (!code) continue;
    codes.add(code);
    if (!nameOf.has(code)) nameOf.set(code, u.name);
  }
  const uppers = [...codes].filter((c) => isUpper(groupOf(c)));
  for (const c of codes) unitGames.set(c, (unitGames.get(c) || 0) + 1);
  for (const up of uppers) {
    upperGames.set(up, (upperGames.get(up) || 0) + 1);
    let m = pairCounts.get(up);
    if (!m) pairCounts.set(up, m = new Map());
    for (const other of codes) {
      if (other === up) continue; // 자기 자신은 동반이 아니다
      m.set(other, (m.get(other) || 0) + 1);
    }
  }
}

const total = games.length;
const out = {};
for (const [up, n] of [...upperGames.entries()].sort((a, b) => b[1] - a[1])) {
  if (n < MIN_UPPER_GAMES) continue;
  const rows = [];
  for (const [other, k] of pairCounts.get(up) || []) {
    if (k < MIN_PAIR_GAMES) continue;
    const conditional = (k / n) * 100;
    const baseline = ((unitGames.get(other) || 0) / total) * 100;
    if (baseline <= 0) continue;
    rows.push({
      code: other,
      name: nameOf.get(other) || other,
      group: cleanGroup(groupOf(other)),
      games: k,
      conditional: Number(conditional.toFixed(1)),
      baseline: Number(baseline.toFixed(1)),
      lift: Number((conditional / baseline).toFixed(2)),
    });
  }
  // 동반 표는 두 갈래로 낸다 — 많이 붙는 순(conditional)과 특별히 붙는 순(lift).
  const byConditional = rows.slice().sort((a, b) => b.conditional - a.conditional || (a.code < b.code ? -1 : 1)).slice(0, TOP_PAIRS);
  const byLift = rows.slice()
    .filter((x) => x.conditional >= 5) // 희귀 조합이 lift 상위를 잠식하지 않게
    .sort((a, b) => b.lift - a.lift || (a.code < b.code ? -1 : 1)).slice(0, TOP_PAIRS);
  out[up] = {
    name: nameOf.get(up) || up,
    group: cleanGroup(groupOf(up)),
    games: n,
    rate: Number(((n / total) * 100).toFixed(2)),
    byConditional,
    byLift,
  };
}

const digest = {
  schema: 'tmo-upper-pairs-v1',
  source: path.basename(INPUT),
  collectedAt: payload.collectedAt || null,
  cutoff: payload.cutoff || null,
  sampleGames: total,
  minUpperGames: MIN_UPPER_GAMES,
  minPairGames: MIN_PAIR_GAMES,
  metrics: {
    conditional: 'P(보조 | 상위) % — 그 상위를 쓴 판에서 이 보조가 나온 비율',
    baseline: 'P(보조) % — 전체 판에서 이 보조가 나온 비율',
    lift: 'conditional / baseline — 1.0이면 범용 픽, 1.5+면 그 상위 쪽에 쏠린 조합',
  },
  caveats: [
    '클리어된 판만 기록됨(실패 판 없음) — 생존 편향. "이 조합이 실패를 덜 한다"는 말은 못 한다',
    '최종 파티 기준이라 상위 재료로 소모된 유닛은 보이지 않는다',
    '동반은 인과가 아니라 공존이다 — 레시피·DPS 판단을 대체하지 않는다',
  ],
  uppers: out,
};

const stamp = (payload.collectedAt || '').slice(0, 10).replace(/-/g, '') || 'latest';
const outPath = path.join(ROOT, 'data', `tmo_upper_pairs_${stamp}.json`);
fs.writeFileSync(outPath, JSON.stringify(digest, null, 1));
console.log(`저장: ${outPath} (상위 ${Object.keys(out).length}종 / 표본 ${total.toLocaleString()}판)`);
