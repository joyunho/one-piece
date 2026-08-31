#!/usr/bin/env node
// 악몽 클리어 전수 코퍼스(+선택적 clears 피드 JSONL)에서 "상위 2기"
// 판만 추려 조합 통계를 만든다.
//   상위 = 제한됨 · 초월 · 불멸 · 영원 · 세라핌 (오로성은 맵 저주 유닛이라 제외)
// 산출: ① 상위 개수 분포 ② 2상위 판의 상위 쌍 순위(계통 표기)
//       ③ 주요 쌍의 동반 보조 top ④ 최근 1주 별도 집계 ⑤ 추출 JSON 저장
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'archive','legacy_program');
global.window = global;
const w = console.warn; console.warn = () => {};
require(path.join(EXT, 'ord_units_data.js'));
require(path.join(EXT, 'ord_data_patch.js'));
console.warn = w;

const catByCode = new Map();
for (const u of global.ORD_TMO_UNITS) for (const c of (u.codes || [])) catByCode.set(String(c).toLowerCase(), u);
const unitByCode = (code) => catByCode.get(String(code).toLowerCase()) || null;
const tierOf = (code) => {
  const u = unitByCode(code);
  return u ? String(u.groupName || '').split(/\s*\[/)[0].trim() : '';
};
const famOf = (code) => {
  const u = unitByCode(code);
  const g = u ? String(u.groupName || '') : '';
  if (/\[마딜\]/.test(g)) return '마딜';
  if (/\[물딜\]/.test(g)) return '물딜';
  // 세라핌은 계통 무표기(양 계통 공용 보조) — 분포 표에서 자체 라벨로 센다.
  return /^세라핌/.test(g) ? '세라핌' : '';
};
const dispOf = (code) => {
  const u = unitByCode(code);
  return u ? String(u.name).replace(/\s*[🚩💙💖🚁⭐️✨]+.*$/, '').replace(/\s*\(.*$/, '').trim() : code;
};
const UPPER_TIERS = new Set(['제한됨', '초월', '불멸', '영원', '세라핌']);
const isUpperCode = (code) => UPPER_TIERS.has(tierOf(code));

// ── 적재 ────────────────────────────────────────────────────────────
const games = new Map(); // key nickname|createdAt → {nick, at, codes:Set, src}
function addGame(nick, at, units, src) {
  const key = nick + '|' + at;
  if (games.has(key)) return;
  const codes = new Set();
  for (const u of units || []) if (u.code) codes.add(String(u.code).toLowerCase());
  if (!codes.size) return;
  games.set(key, {nick, at, codes, src});
}
for (const f of ['tmo_nightmare_all_20260728.json.gz', 'tmo_nightmare_all_20260811.json.gz']) {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data', f))));
  for (const p of j.players || []) {
    if (p.error) continue;
    for (const r of p.records || []) if (r.difficulty === '악몽') addGame(p.nickname || p.user || '?', r.createdAt, r.units, 'corpus');
  }
}
const FEED = process.argv[2];
let feedCount = 0;
if (FEED && fs.existsSync(FEED)) {
  const raw = fs.readFileSync(FEED, 'utf8');
  const rows = /\.jsonl$/.test(FEED)
    ? raw.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean)
    : (JSON.parse(raw).clears || []);
  for (const c of rows) if (c.difficulty === '악몽') { addGame((c.user && c.user.nickname) || '?', c.createdAt, c.units, 'feed'); feedCount++; }
}

// ── 집계 ────────────────────────────────────────────────────────────
const all = [...games.values()];
const dist = new Map();
const twoUpper = [];
for (const g of all) {
  const uppers = [...g.codes].filter(isUpperCode);
  const n = uppers.length;
  dist.set(n, (dist.get(n) || 0) + 1);
  if (n === 2) twoUpper.push({...g, uppers});
}
console.log(`악몽 클리어 전체(중복 제거): ${all.length}판  (피드 신규 구간 악몽 ${feedCount}건 포함 시도)`);
console.log('상위 개수 분포:', [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}기=${v}판(${(v / all.length * 100).toFixed(1)}%)`).join(' · '));

const pairKey = (a, b) => [a, b].sort().join('+');
const pairs = new Map();
for (const g of twoUpper) {
  const k = pairKey(g.uppers[0], g.uppers[1]);
  if (!pairs.has(k)) pairs.set(k, {count: 0, games: []});
  const e = pairs.get(k); e.count++; e.games.push(g);
}
const ranked = [...pairs.entries()].sort((a, b) => b[1].count - a[1].count);
console.log(`\n== 2상위 판 ${twoUpper.length}판 · 상위 쌍 ${ranked.length}종 — 상위 25쌍 ==`);
for (const [k, e] of ranked.slice(0, 25)) {
  const [a, b] = k.split('+');
  console.log(`${String(e.count).padStart(5)}판  ${dispOf(a)}(${tierOf(a)}${famOf(a) ? '·' + famOf(a) : ''}) + ${dispOf(b)}(${tierOf(b)}${famOf(b) ? '·' + famOf(b) : ''})`);
}

// 계통 조합 분포 (마딜+마딜 / 물딜+물딜 / 혼합 / 무계통 포함)
const famDist = new Map();
for (const g of twoUpper) {
  const fams = g.uppers.map(famOf).sort().join('+') || '(계통표기없음)';
  famDist.set(fams, (famDist.get(fams) || 0) + 1);
}
console.log('\n계통 조합 분포:', [...famDist.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}판(${(v / twoUpper.length * 100).toFixed(1)}%)`).join(' · '));

// 상위 5쌍의 동반 보조 top10 (conditional %)
for (const [k, e] of ranked.slice(0, 5)) {
  const [a, b] = k.split('+');
  const comp = new Map();
  for (const g of e.games) for (const c of g.codes) if (c !== a && c !== b) comp.set(c, (comp.get(c) || 0) + 1);
  const top = [...comp.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10);
  console.log(`\n· ${dispOf(a)} + ${dispOf(b)} (${e.count}판) 동반 보조:`);
  console.log('  ' + top.map(([c, n]) => `${dispOf(c)} ${(n / e.count * 100).toFixed(0)}%`).join(' · '));
}

// 최근 1주(피드 구간) 별도
const weekTwo = twoUpper.filter(g => g.src === 'feed');
if (weekTwo.length) {
  const wp = new Map();
  for (const g of weekTwo) { const k = pairKey(g.uppers[0], g.uppers[1]); wp.set(k, (wp.get(k) || 0) + 1); }
  console.log(`\n== 최근 1주(8/11~8/18) 악몽 2상위 ${weekTwo.length}판 — 쌍 순위 ==`);
  for (const [k, n] of [...wp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    const [a, b] = k.split('+');
    console.log(`${String(n).padStart(4)}판  ${dispOf(a)}(${famOf(a) || tierOf(a)}) + ${dispOf(b)}(${famOf(b) || tierOf(b)})`);
  }
}

// 추출 저장
const out = process.argv[3];
if (out) {
  fs.writeFileSync(out, JSON.stringify({
    schema: 'ord-nightmare-two-upper-v1',
    generatedAt: new Date().toISOString(),
    sources: ['tmo_nightmare_all_20260728', 'tmo_nightmare_all_20260811', FEED ? path.basename(FEED) : null].filter(Boolean),
    totalNightmare: all.length,
    upperCountDist: Object.fromEntries([...dist.entries()].sort((a, b) => a[0] - b[0])),
    twoUpperCount: twoUpper.length,
    pairRanking: ranked.map(([k, e]) => {
      const [a, b] = k.split('+');
      return {pair: [a, b], names: [dispOf(a), dispOf(b)], tiers: [tierOf(a), tierOf(b)], families: [famOf(a), famOf(b)], count: e.count};
    }),
    games: twoUpper.map(g => ({nickname: g.nick, createdAt: g.at, source: g.src, uppers: g.uppers.map(c => ({code: c, name: dispOf(c), tier: tierOf(c), family: famOf(c)})), units: [...g.codes]}))
  }));
  console.log(`\n추출 저장: ${out}`);
}
