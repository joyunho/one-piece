#!/usr/bin/env node
// data/tmo_nightmare_all_*.json(악몽 클리어 전수 기록)에서 통계 리포트를 만든다.
//
// 산출물 2종:
//   1) JSON 다이제스트  data/tmo_nightmare_stats_<날짜>.json  (재분석·비교용)
//   2) 사람이 읽는 리포트 TMO_악몽_통계_<날짜>.txt            (저장소 분석 노트 형식)
//
// 재현 원칙: 같은 입력 → 같은 출력(정렬 고정, 시각 입력은 payload.collectedAt만 사용).
//
// 사용: node tools/tmo_nightmare_stats.js [입력.json] [--out-json X] [--out-txt Y]
//   대용량 입력이므로 필요 시: node --max-old-space-size=8192 tools/tmo_nightmare_stats.js

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'ord_tmo_auto_extension_v15_0_0_rebuild');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function latestInput() {
  const dir = path.join(ROOT, 'data');
  const names = fs.readdirSync(dir).filter((n) => /^tmo_nightmare_all_\d{8}\.json$/.test(n)).sort();
  if (!names.length) throw new Error('data/tmo_nightmare_all_*.json 이 없습니다 — tools/tmo_nightmare_collect_all.js 먼저 실행');
  return path.join(dir, names[names.length - 1]);
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const prevArg = (a) => process.argv[process.argv.indexOf(a) - 1];
const INPUT = positional.find((a) => !String(prevArg(a) || '').startsWith('--')) || latestInput();

// ── 유닛 카탈로그(등급군 판정) ──────────────────────────────────────────────
global.window = global;
require(path.join(EXT, 'ord_units_data.js'));
require(path.join(EXT, 'ord_data_patch.js'));

const catByCode = new Map();
for (const u of global.ORD_TMO_UNITS) {
  for (const c of (u.codes || [])) catByCode.set(String(c).toLowerCase(), u);
}
const groupOf = (code) => {
  const cat = code ? catByCode.get(String(code).toLowerCase()) : null;
  return cat ? String(cat.groupName || '') : '';
};
const isUpper = (g) => /^(제한됨|초월|불멸|영원)/.test(g);
const isLegendish = (g) => /^(전설|히든|왜곡됨|변화된)/.test(g);
const isShip = (g) => /^해적선/.test(g);
const isSeraph = (g) => /^세라핌/.test(g);
// 카탈로그 groupName 일부에 설명이 덧붙어 있다("초월 [물딜]  물딜은 대부분 ...").
// 표에는 등급명까지만 쓴다.
const cleanGroup = (g) => String(g).split(/\s{2,}/)[0].trim();
const dmgTag = (g, name) => {
  const src = g && g.includes('[') ? g : String(name || '');
  if (src.includes('[마딜]')) return 'magic';
  if (src.includes('[물딜]')) return 'physical';
  if (src.includes('[스턴]')) return 'stun';
  return 'untagged';
};

// ── 통계 헬퍼 ──────────────────────────────────────────────────────────────
const pct = (n, d) => (d ? (n / d) * 100 : 0);
const fx = (v, n = 1) => Number(v).toFixed(n);
function quantiles(sortedArr) {
  const q = (p) => (sortedArr.length ? sortedArr[Math.min(sortedArr.length - 1, Math.floor(sortedArr.length * p))] : 0);
  const sum = sortedArr.reduce((a, b) => a + b, 0);
  return {
    n: sortedArr.length,
    mean: sortedArr.length ? sum / sortedArr.length : 0,
    p10: q(0.1), p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9), p99: q(0.99),
    min: sortedArr[0] || 0, max: sortedArr[sortedArr.length - 1] || 0,
  };
}
// KST(UTC+9) 기준 날짜/시각 — 한국 서버 게임이라 일자·시간대는 KST로 읽는다.
const KST_MS = 9 * 3600 * 1000;
const kst = (iso) => new Date(Date.parse(iso) + KST_MS);
const kstDay = (iso) => kst(iso).toISOString().slice(0, 10);
const kstMonth = (iso) => kst(iso).toISOString().slice(0, 7);
const kstHour = (iso) => kst(iso).getUTCHours();

function sortedCounts(map, limit) {
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return limit ? rows.slice(0, limit) : rows;
}

// ── 입력 ───────────────────────────────────────────────────────────────────
const payload = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const cutoffMs = Date.parse(payload.cutoff);
const allPlayers = payload.players || [];
const okPlayers = allPlayers.filter((p) => p && !p.error);
const errPlayers = allPlayers.filter((p) => p && p.error);
// 컷오프 이후 악몽 클리어가 1판이라도 있는 플레이어만 통계 모집단.
// (수집기는 이미 악몽만 남기지만, 전 난이도를 담은 상위권 표본 파일도 읽히게 한다.)
const nightmareOf = (p) => (p.records || []).filter((r) => r.difficulty === '악몽');
const players = okPlayers.filter((p) => nightmareOf(p).length > 0);

// ── 판 단위 집계 ───────────────────────────────────────────────────────────
const MIN_GAMES_UNIT = 30; // 유닛 표에 올릴 최소 표본(극소 표본 오독 방지)
const FARM_UNITCOUNT = 26; // 잔존 유닛 26+ = 파밍 판으로 간주(기존 분석 p90 기준)
const BIG_SCORE = 1000;    // nightmare-score 규모 분기점(수십 vs 수만)

const bigScores = [];
const smallScores = [];
const bigScorePlayers = new Set();
const smallScorePlayers = new Set();

const partySizes = [];
const unitCounts = [];
const scores = [];
const perPlayerGames = [];
const byDay = new Map();
const byMonth = new Map();
const byHour = new Map();
const byWeekday = new Map();
const upperCountDist = new Map();
const archetype = new Map();
const unitGames = new Map();      // code -> { games, names:Map, ucSum, ucN, party }
const monthUnitGames = new Map(); // month -> Map(code -> games)
const monthGames = new Map();
const groupPresence = new Map();  // 등급군 -> 등장 판수
let shipGames = 0, seraphGames = 0, farmGames = 0;
let totalGames = 0;
let outOfRange = 0;

// 플레이어 층위 비교(코어/중간/라이트) — 표본 편향을 눈으로 확인하기 위한 층화.
const tiers = [
  { key: 'core', label: '코어(100판+)', test: (n) => n >= 100 },
  { key: 'mid', label: '중간(10~99판)', test: (n) => n >= 10 && n < 100 },
  { key: 'light', label: '라이트(1~9판)', test: (n) => n < 10 },
];
const tierAgg = new Map(tiers.map((t) => [t.key, {
  players: 0, games: 0, party: [], unitCount: [], score: [], arch: new Map(), upperDist: new Map(), unit: new Map(),
}]));

for (const p of players) {
  const recs = nightmareOf(p);
  perPlayerGames.push({ nickname: p.nickname, games: recs.length, ranks: p.ranks || [] });
  const tier = tiers.find((t) => t.test(recs.length));
  const agg = tierAgg.get(tier.key);
  agg.players += 1;

  for (const r of recs) {
    const ts = Date.parse(r.createdAt);
    if (!Number.isFinite(ts) || ts < cutoffMs) { outOfRange += 1; continue; }
    totalGames += 1;
    const month = kstMonth(r.createdAt);
    byDay.set(kstDay(r.createdAt), (byDay.get(kstDay(r.createdAt)) || 0) + 1);
    byMonth.set(month, (byMonth.get(month) || 0) + 1);
    byHour.set(kstHour(r.createdAt), (byHour.get(kstHour(r.createdAt)) || 0) + 1);
    const wd = kst(r.createdAt).getUTCDay();
    byWeekday.set(wd, (byWeekday.get(wd) || 0) + 1);
    monthGames.set(month, (monthGames.get(month) || 0) + 1);
    if (!monthUnitGames.has(month)) monthUnitGames.set(month, new Map());
    const mUnits = monthUnitGames.get(month);

    const uc = Number(r.unitCount);
    if (Number.isFinite(uc)) { unitCounts.push(uc); agg.unitCount.push(uc); if (uc >= FARM_UNITCOUNT) farmGames += 1; }
    const sc = Number(r.score);
    if (Number.isFinite(sc)) {
      scores.push(sc);
      agg.score.push(sc);
      // nightmare-score는 두 규모가 섞여 있다(수십 vs 수만). 플레이어 단위로 갈리는
      // 걸 보면 점수 산정이 다른 모드/버전으로 보이나 정의 미확인 — 섞어서 중앙값을
      // 내면 오독되므로 규모별로 나눠 집계한다.
      if (sc > BIG_SCORE) { bigScores.push(sc); bigScorePlayers.add(p.nickname); }
      else { smallScores.push(sc); smallScorePlayers.add(p.nickname); }
    }

    let party = 0;
    let upperUnits = 0;
    const seen = new Set();
    const tags = new Set();
    const groupsSeen = new Set();
    let hasShip = false, hasSeraph = false;
    for (const u of r.units || []) {
      const code = u.code ? String(u.code).toLowerCase() : '';
      party += Number(u.count) || 1;
      if (!code) continue;
      const g = groupOf(code);
      if (!seen.has(code)) {
        seen.add(code);
        let e = unitGames.get(code);
        if (!e) unitGames.set(code, e = { games: 0, names: new Map(), ucSum: 0, ucN: 0, group: g });
        e.games += 1;
        e.names.set(u.name, (e.names.get(u.name) || 0) + 1);
        if (Number.isFinite(uc)) { e.ucSum += uc; e.ucN += 1; }
        mUnits.set(code, (mUnits.get(code) || 0) + 1);
        agg.unit.set(code, (agg.unit.get(code) || 0) + 1);
      }
      if (g) groupsSeen.add(g);
      if (isUpper(g)) { upperUnits += Number(u.count) || 1; tags.add(dmgTag(g, u.name)); }
      if (isShip(g)) hasShip = true;
      if (isSeraph(g)) hasSeraph = true;
    }
    if (hasShip) shipGames += 1;
    if (hasSeraph) seraphGames += 1;
    for (const g of groupsSeen) groupPresence.set(g, (groupPresence.get(g) || 0) + 1);

    partySizes.push(party);
    agg.party.push(party);
    upperCountDist.set(upperUnits, (upperCountDist.get(upperUnits) || 0) + 1);
    agg.upperDist.set(upperUnits, (agg.upperDist.get(upperUnits) || 0) + 1);
    const archKey = upperUnits === 0 ? 'none' : [...tags].sort().join('+');
    archetype.set(archKey, (archetype.get(archKey) || 0) + 1);
    agg.arch.set(archKey, (agg.arch.get(archKey) || 0) + 1);
    agg.games += 1;
  }
}

partySizes.sort((a, b) => a - b);
unitCounts.sort((a, b) => a - b);
scores.sort((a, b) => a - b);
perPlayerGames.sort((a, b) => b.games - a.games || (a.nickname < b.nickname ? -1 : 1));
const perPlayerSorted = perPlayerGames.map((p) => p.games).slice().sort((a, b) => a - b);

const nameOf = (code) => {
  const e = unitGames.get(code);
  if (!e) return code;
  return [...e.names.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
};

// 등급군별 대표 픽 표 — 상위/전설급/전체를 나눠 본다.
function unitTable(filterFn, limit) {
  return [...unitGames.entries()]
    .filter(([code, e]) => e.games >= MIN_GAMES_UNIT && filterFn(e.group, code))
    .sort((a, b) => b[1].games - a[1].games || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([code, e]) => ({
      code,
      name: nameOf(code),
      group: e.group,
      games: e.games,
      rate: Number(fx(pct(e.games, totalGames), 2)),
      avgUnitCount: e.ucN ? Number(fx(e.ucSum / e.ucN, 1)) : null,
    }));
}

// 월별 픽률 변화(6월 → 7월): 표본이 충분한 유닛만.
function monthShift(limit) {
  const months = [...monthGames.keys()].sort();
  if (months.length < 2) return { months, rows: [] };
  const [a, b] = [months[0], months[months.length - 1]];
  const ga = monthGames.get(a), gb = monthGames.get(b);
  const rows = [];
  for (const [code, e] of unitGames) {
    if (e.games < MIN_GAMES_UNIT * 3) continue;
    const ra = pct((monthUnitGames.get(a) || new Map()).get(code) || 0, ga);
    const rb = pct((monthUnitGames.get(b) || new Map()).get(code) || 0, gb);
    rows.push({ code, name: nameOf(code), group: e.group, from: Number(fx(ra, 2)), to: Number(fx(rb, 2)), delta: Number(fx(rb - ra, 2)) });
  }
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || (x.code < y.code ? -1 : 1));
  return { months: [a, b], rows: rows.slice(0, limit) };
}

const distObj = (m, keyFn) => {
  const out = {};
  for (const k of [...m.keys()].sort(keyFn || ((x, y) => (x < y ? -1 : 1)))) out[String(k)] = m.get(k);
  return out;
};
const numericSort = (a, b) => Number(a) - Number(b);

const tierOut = {};
for (const t of tiers) {
  const a = tierAgg.get(t.key);
  a.party.sort((x, y) => x - y);
  a.unitCount.sort((x, y) => x - y);
  const arch = [...a.arch.entries()].sort((x, y) => y[1] - x[1]);
  tierOut[t.key] = {
    label: t.label,
    players: a.players,
    games: a.games,
    gameShare: Number(fx(pct(a.games, totalGames), 1)),
    partyMedian: quantiles(a.party).median,
    unitCountMedian: quantiles(a.unitCount).median,
    archetype: Object.fromEntries(arch.map(([k, v]) => [k, Number(fx(pct(v, a.games), 1))])),
    upperPerGame: Number(fx([...a.upperDist.entries()].reduce((s, [k, v]) => s + Number(k) * v, 0) / Math.max(1, a.games), 2)),
    topUnits: [...a.unit.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10)
      .map(([code, n]) => ({ name: nameOf(code), rate: Number(fx(pct(n, a.games), 1)) })),
  };
}

const days = [...byDay.keys()].sort();
const digest = {
  schema: 'tmo-nightmare-stats-v1',
  source: path.basename(INPUT),
  collectedAt: payload.collectedAt || null,
  cutoff: payload.cutoff || null,
  cutoffKst: new Date(cutoffMs + KST_MS).toISOString().replace('T', ' ').slice(0, 16) + ' KST',
  scope: payload.scope || null,
  caveats: payload.caveats || [],
  sample: {
    rankedPlayers: allPlayers.length,
    playersWithGames: players.length,
    playersWithoutGames: okPlayers.length - players.length,
    failedPlayers: errPlayers.length,
    truncatedPlayers: payload.truncatedPlayerCount || 0,
    games: totalGames,
    droppedBeforeCutoff: outOfRange,
    dayRange: [days[0] || null, days[days.length - 1] || null],
  },
  perPlayer: quantiles(perPlayerSorted),
  topPlayers: perPlayerGames.slice(0, 30).map((p) => ({ nickname: p.nickname, games: p.games })),
  partySize: quantiles(partySizes),
  unitCount: { ...quantiles(unitCounts), farmRate: Number(fx(pct(farmGames, totalGames), 1)), farmThreshold: FARM_UNITCOUNT },
  score: {
    all: quantiles(scores),
    // 규모가 갈리는 이유는 미확인 — 정의 확인 전까지 지표로 쓰지 말 것.
    small: { ...quantiles(smallScores.slice().sort((a, b) => a - b)), players: smallScorePlayers.size },
    big: { ...quantiles(bigScores.slice().sort((a, b) => a - b)), players: bigScorePlayers.size },
    bigThreshold: BIG_SCORE,
    bigGameRate: Number(fx(pct(bigScores.length, totalGames), 1)),
  },
  // 커버리지 대조: 월간 랭킹의 클리어 합계(= 그 달 전체 클리어 수) 대비 수집 판수.
  // 컷오프가 달 중간이면 그 달은 자연히 낮게 나오고, 이후 달은 100%에 가까워야 한다.
  coverage: (() => {
    const ranked = (payload.pools && payload.pools.seasonClears) || null;
    if (!ranked) return null;
    const rows = {};
    for (const m of Object.keys(ranked).sort()) {
      const got = byMonth.get(m) || 0;
      rows[m] = { rankingClears: ranked[m], collected: got, rate: Number(fx(pct(got, ranked[m]), 1)) };
    }
    return rows;
  })(),
  byMonth: distObj(byMonth),
  byDay: distObj(byDay),
  byHourKst: distObj(byHour, numericSort),
  byWeekdayKst: distObj(byWeekday, numericSort),
  upperCountDist: distObj(upperCountDist, numericSort),
  upperCountRate: Object.fromEntries([...upperCountDist.entries()].sort((a, b) => a[0] - b[0])
    .map(([k, v]) => [String(k), Number(fx(pct(v, totalGames), 1))])),
  archetype: Object.fromEntries(sortedCounts(archetype).map(([k, v]) => [k, { games: v, rate: Number(fx(pct(v, totalGames), 1)) }])),
  groupPresence: Object.fromEntries(sortedCounts(groupPresence).map(([k, v]) => [cleanGroup(k), Number(fx(pct(v, totalGames), 1))])),
  shipRate: Number(fx(pct(shipGames, totalGames), 1)),
  seraphRate: Number(fx(pct(seraphGames, totalGames), 1)),
  minGamesForUnitTable: MIN_GAMES_UNIT,
  topUnitsOverall: unitTable(() => true, 40),
  topUpper: unitTable((g) => isUpper(g), 30),
  topLegendish: unitTable((g) => isLegendish(g), 30),
  topShipSeraph: unitTable((g) => isShip(g) || isSeraph(g), 12),
  monthShift: monthShift(25),
  tiers: tierOut,
};

const outJson = arg('--out-json', path.join(ROOT, 'data', `tmo_nightmare_stats_${(payload.collectedAt || '').slice(0, 10).replace(/-/g, '') || 'latest'}.json`));
fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(digest, null, 1));

// ── 사람이 읽는 리포트 ─────────────────────────────────────────────────────
const L = [];
const line = (s = '') => L.push(s);
const bar = (v, max, width = 24) => '█'.repeat(Math.max(0, Math.round((v / (max || 1)) * width)));
const stamp = (payload.collectedAt || '').slice(0, 10);

line(`TMO.GG 악몽 클리어 전수 통계 (${stamp})`);
line('='.repeat(52));
line();
line('수집 범위');
line('---------');
line(`- 출처: api.tmo.gg 공개 API (랭킹 ordr2 / categoryId=nightmare-clear)`);
line(`- 컷오프: ${digest.cutoff} (= ${digest.cutoffKst} 이후만)`);
line(`- 대상: ${digest.scope || '수집기 지정 표본'} — 랭킹 합집합 ${digest.sample.rankedPlayers}명`);
line(`  → 컷오프 이후 클리어 있는 ${digest.sample.playersWithGames}명 / 없는 ${digest.sample.playersWithoutGames}명` +
     `${digest.sample.failedPlayers ? ` / 조회 실패 ${digest.sample.failedPlayers}명` : ''}`);
line(`- 판수: ${digest.sample.games.toLocaleString()}판 (${digest.sample.dayRange[0]} ~ ${digest.sample.dayRange[1]} KST)`);
line(`- 수집 시각: ${digest.collectedAt}`);
if (digest.coverage) {
  line('- 커버리지 대조 (월간 랭킹 클리어 합계 대비 수집 판수):');
  for (const [m, c] of Object.entries(digest.coverage)) {
    const note = Date.parse(`${m}-01T00:00:00Z`) < cutoffMs ? ' ← 컷오프가 달 중간이라 낮은 게 정상' : '';
    line(`  · ${m}: ${c.collected.toLocaleString()} / ${c.rankingClears.toLocaleString()} = ${c.rate}%${note}`);
  }
}
line();
line('주의');
line('----');
for (const c of digest.caveats) line(`- ${c}`);
line('- 월간 랭킹 합집합이므로 컷오프 이후 클리어자는 전원 포함된다(닉변경 계정 제외).');
line();

line('1. 플레이어별 클리어 분포');
line('-------------------------');
const pp = digest.perPlayer;
line(`- 평균 ${fx(pp.mean)}판 / 중앙값 ${pp.median}판 / p75 ${pp.p75} / p90 ${pp.p90} / p99 ${pp.p99} / 최대 ${pp.max}`);
line(`- 상위 30명 (닉네임 · 판수):`);
for (const [i, p] of digest.topPlayers.entries()) {
  line(`   ${String(i + 1).padStart(2)}. ${p.nickname} — ${p.games}판`);
}
const top1 = digest.topPlayers.reduce((s, p) => s + p.games, 0);
line(`- 상위 30명이 전체의 ${fx(pct(top1, totalGames))}% 차지 — 소수 헤비 유저 편중.`);
line();

line('2. 층위별 비교 (표본 편향 점검)');
line('-------------------------------');
for (const t of tiers) {
  const o = tierOut[t.key];
  if (!o.games) { line(`- ${o.label}: 해당 없음`); continue; }
  const archTop = Object.entries(o.archetype).slice(0, 3).map(([k, v]) => `${k} ${v}%`).join(' · ');
  line(`- ${o.label}: ${o.players}명 ${o.games.toLocaleString()}판(${o.gameShare}%) · 파티 중앙 ${o.partyMedian} · ` +
       `잔존 중앙 ${o.unitCountMedian} · 판당 상위 ${o.upperPerGame}기`);
  line(`    아키타입 ${archTop}`);
  line(`    최다 픽 ${o.topUnits.slice(0, 5).map((u) => `${u.name.replace(/\(.*/, '')} ${u.rate}%`).join(' · ')}`);
}
line('  → 층위별 파티·아키타입 차이가 작을수록 상위권 표본으로 일반화해도 안전하다.');
line();

line('3. 파티 크기 / 잔존 유닛 / 점수');
line('-------------------------------');
const ps = digest.partySize, ucq = digest.unitCount, scq = digest.score;
line(`- 파티 크기: 중앙 ${ps.median} (p10 ${ps.p10} · p25 ${ps.p25} · p75 ${ps.p75} · p90 ${ps.p90} · 최대 ${ps.max}, 평균 ${fx(ps.mean)})`);
line(`- 잔존 유닛(unitCount, 클리어 후 남은 수): 중앙 ${ucq.median} (p10 ${ucq.p10} · p90 ${ucq.p90} · 최대 ${ucq.max})`);
line(`  · ${FARM_UNITCOUNT}기 이상 = ${ucq.farmRate}% — 파밍 판으로 추정(효율 지표로 쓸 때 분리 필요)`);
line(`- 악몽 점수(nightmare-score): 두 규모가 섞여 있어 나눠 본다 — 정의 미확인, 지표로 쓰지 말 것`);
line(`  · 소규모(≤${BIG_SCORE}): ${scq.small.n.toLocaleString()}판 · ${scq.small.players}명 · 중앙 ${scq.small.median} (p10 ${scq.small.p10} · p90 ${scq.small.p90})`);
line(`  · 대규모(>${BIG_SCORE}): ${scq.big.n.toLocaleString()}판(${scq.bigGameRate}%) · ${scq.big.players}명 · 중앙 ${scq.big.median.toLocaleString()} (p10 ${scq.big.p10.toLocaleString()} · p90 ${scq.big.p90.toLocaleString()})`);
line(`  · 규모는 플레이어 단위로 갈린다(한 사람은 대체로 한쪽) — 모드·집계 버전 차이로 보이나 확인 필요.`);
line();

line('4. 판당 상위 유닛 수');
line('--------------------');
for (const [k, v] of Object.entries(digest.upperCountRate)) {
  line(`   ${String(k).padStart(2)}기: ${String(fx(v)).padStart(5)}%  ${bar(v, 100, 40)}`);
}
line();

line('5. 아키타입 (상위 유닛의 딜 태그 조합)');
line('--------------------------------------');
for (const [k, v] of Object.entries(digest.archetype)) {
  line(`   ${k.padEnd(18)} ${String(v.rate).padStart(5)}%  (${v.games.toLocaleString()}판)`);
}
line();

line('6. 등급군 등장률 (판당 1회 이상 등장 비율)');
line('------------------------------------------');
for (const [g, r] of Object.entries(digest.groupPresence)) {
  line(`   ${g.slice(0, 30).padEnd(31)} ${String(fx(r)).padStart(5)}%`);
}
line(`   해적선 포함 ${digest.shipRate}% · 세라핌 포함 ${digest.seraphRate}%`);
line();

const table = (title, rows) => {
  line(title);
  line('-'.repeat(title.length));
  for (const [i, u] of rows.entries()) {
    line(`   ${String(i + 1).padStart(2)}. ${u.name.slice(0, 34).padEnd(35)} ${String(u.rate).padStart(5)}%  ` +
         `(${u.games.toLocaleString()}판${u.avgUnitCount !== null ? ` · 평균잔존 ${u.avgUnitCount}` : ''})`);
  }
  line();
};
table('7. 전체 픽률 상위 40', digest.topUnitsOverall);
table('8. 상위(초월·불멸·영원·제한됨) 픽률 상위 30', digest.topUpper);
table('9. 전설·히든·왜곡·변화 픽률 상위 30', digest.topLegendish);
table('10. 해적선·세라핌', digest.topShipSeraph);

line('11. 월별 픽률 변화 (' + digest.monthShift.months.join(' → ') + ')');
line('-'.repeat(40));
for (const r of digest.monthShift.rows) {
  const sign = r.delta > 0 ? '+' : '';
  line(`   ${r.name.slice(0, 32).padEnd(33)} ${String(r.from).padStart(5)}% → ${String(r.to).padStart(5)}%  (${sign}${r.delta}p)`);
}
line();

line('12. 시간대·요일 (KST)');
line('---------------------');
const hourMax = Math.max(...Object.values(digest.byHourKst));
for (const [h, v] of Object.entries(digest.byHourKst)) {
  line(`   ${String(h).padStart(2)}시 ${String(v).padStart(6)}  ${bar(v, hourMax, 34)}`);
}
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const wdMax = Math.max(...Object.values(digest.byWeekdayKst));
line();
for (const [d, v] of Object.entries(digest.byWeekdayKst)) {
  line(`   ${WD[Number(d)]} ${String(v).padStart(6)}  ${bar(v, wdMax, 34)}`);
}
line();

line('13. 일자별 클리어 수 (KST)');
line('--------------------------');
const dayMax = Math.max(...Object.values(digest.byDay));
for (const [d, v] of Object.entries(digest.byDay)) {
  line(`   ${d} ${String(v).padStart(6)}  ${bar(v, dayMax, 34)}`);
}
line();
line(`월별 합계: ${Object.entries(digest.byMonth).map(([m, v]) => `${m} ${v.toLocaleString()}판`).join(' · ')}`);
line();
line(`(JSON 다이제스트: ${path.relative(ROOT, outJson)})`);

const outTxt = arg('--out-txt', path.join(ROOT, `TMO_악몽_통계_${stamp.replace(/-/g, '')}.txt`));
fs.writeFileSync(outTxt, L.join('\n') + '\n');

console.log(`리포트: ${outTxt}`);
console.log(`다이제스트: ${outJson}`);
console.log(`표본: ${digest.sample.playersWithGames}명 ${totalGames.toLocaleString()}판 (${digest.sample.dayRange[0]} ~ ${digest.sample.dayRange[1]})`);
