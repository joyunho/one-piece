#!/usr/bin/env node
// data/tmo_nightmare_all_*.json.gz(전수 클리어 랭킹)의 판별 최종 유닛 구성
// 96,625판을 코치의 역할 원장(roleContribution)으로 재해석해 실측 통계
// ord_clear_stats.js 를 재생성한다.
//
// 지금까지 이 데이터에서 픽률(byCode)만 썼다 — 여기서는 "검증된 클리어
// 조합이 실제로 역할을 얼마나 챙겼는가"의 분포(백분위)를 뽑는다:
//   · 상위(정규화)별 이감/스턴/방깎/체젠/단·끝 분포 p10/p25/p50/p75
//   · 상위별 실측 파트너(동시 등장 점유율) 상위 8
//   · 계통(마딜/물딜)별 전체 분포
//
// 용도 경계(데이터에 새김): 표시·경고 전용.  이 수치로 게이트를 만들거나
// 목표치를 자동 교체하지 않는다 — 최종 조합만 있고 과정(라운드)이 없는
// 데이터라 "무엇을"의 근거이지 "언제"의 근거가 아니다.
//
// 재현 빌드: 같은 입력 → 바이트 동일 출력 (비결정 입력 없음, 정렬 고정).
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'ord_tmo_auto_extension_v15_0_0_rebuild');

function latestInput() {
  const dir = path.join(ROOT, 'data');
  const all = fs.readdirSync(dir).filter((name) => /^tmo_nightmare_all_\d{8}\.json(\.gz)?$/.test(name)).sort();
  if (!all.length) throw new Error('data/tmo_nightmare_all_*.json(.gz) 없음');
  return path.join(dir, all[all.length - 1]);
}

// 카탈로그·원장 로드 (리플레이 하니스와 같은 스택, 엔진 제외)
global.window = global;
for (const file of [
  'ord_units_data.js', 'ord_upper_memo.js', 'ord_synergy_memo.js', 'ord_upper_playbook.js',
  'ord_data_patch.js', 'ord_story_nonupper_data.js', 'ord_story_upper_data.js',
  'ord_upper_combat_data.js', 'ord_upper_skill_digest.js', 'ord_upper_skill_dps.js',
  'ord_meta_stats.js', 'ord_local_code_map.js', 'ord_core.js'
]) require(path.join(EXT, file));
const C = global.ORDCore;
const LM = global.ORD_LOCAL_MAP;
const catalog = global.ORD_TMO_UNITS;

const inputPath = process.argv[2] || latestInput();
const rawBytes = fs.readFileSync(inputPath);
const data = JSON.parse(inputPath.endsWith('.gz') ? zlib.gunzipSync(rawBytes).toString('utf8') : rawBytes.toString('utf8'));

const byId = new Map(catalog.map((unit) => [String(unit.id), unit]));
const catalogIds = new Set(catalog.map((unit) => String(unit.id)));
const index = LM.buildCodeIndex(catalog, C.canonicalUpperId);
function resolveCode(code) {
  const key = String(code || '');
  return LM.CODE_MAP[key] || (catalogIds.has(key) ? key : '') || (index.map[key] || '');
}

// 역할 키: 결손 원장과 같은 의미의 합계.  stun 은 원 스턴값 합(=1.5스턴
// 축의 current), armorAll 은 상시+발동 방깎 합.
const ROLE_KEYS = ['slow', 'stun', 'armor', 'triggerArmor', 'bossFrenzy', 'single', 'end', 'regen', 'mana'];
const contributionCache = new Map();
function contributionOf(unit, mode) {
  const key = unit.id + '|' + mode;
  let cached = contributionCache.get(key);
  if (!cached) { cached = C.roleContribution(unit, mode); contributionCache.set(key, cached); }
  return cached;
}

function walkRecords(node, out) {
  if (Array.isArray(node)) { for (const item of node) walkRecords(item, out); return; }
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node.records)) for (const record of node.records) out.push(record);
  for (const value of Object.values(node)) if (value && typeof value === 'object') walkRecords(value, out);
}
const records = [];
walkRecords(data, records);

const perUpper = new Map(); // canonical -> {name, games, dualGames, samples:{key:[]}, partners:Map}
const perFamily = new Map(); // magic|physical -> {games, samples:{key:[]}}
let usable = 0, skippedNoUpper = 0, skippedUnresolved = 0;

for (const record of records) {
  const rawUnits = Array.isArray(record.units) ? record.units : [];
  if (!rawUnits.length) continue;
  const resolved = [];
  let unresolved = 0;
  for (const row of rawUnits) {
    const id = resolveCode(row.code);
    const unit = id && byId.get(id);
    if (!unit) { unresolved += 1; continue; }
    resolved.push({unit, count: Math.max(1, Number(row.count) || 1)});
  }
  if (!resolved.length || unresolved > rawUnits.length / 2) { skippedUnresolved += 1; continue; }
  const uppers = resolved.filter((row) => C.isUpper(row.unit));
  if (!uppers.length) { skippedNoUpper += 1; continue; }
  const mainProfile = C.roleProfile(uppers[0].unit);
  const family = mainProfile.family === 'physical' ? 'physical' : 'magic';
  const sums = {};
  for (const key of ROLE_KEYS) sums[key] = 0;
  for (const row of resolved) {
    const contribution = contributionOf(row.unit, family);
    for (const key of ROLE_KEYS) sums[key] += (Number(contribution[key]) || 0) * row.count;
  }
  usable += 1;
  const famBucket = perFamily.get(family) || {games: 0, samples: Object.fromEntries(ROLE_KEYS.map((k) => [k, []]))};
  famBucket.games += 1;
  for (const key of ROLE_KEYS) famBucket.samples[key].push(sums[key]);
  perFamily.set(family, famBucket);
  const canonicals = [...new Set(uppers.map((row) => String(C.canonicalUpperId(row.unit.id))))];
  for (const canonical of canonicals) {
    const upperUnit = uppers.find((row) => String(C.canonicalUpperId(row.unit.id)) === canonical).unit;
    const bucket = perUpper.get(canonical) || {
      name: upperUnit.name, games: 0, dualGames: 0,
      samples: Object.fromEntries(ROLE_KEYS.map((k) => [k, []])), partners: new Map()
    };
    bucket.games += 1;
    if (canonicals.length > 1) bucket.dualGames += 1;
    for (const key of ROLE_KEYS) bucket.samples[key].push(sums[key]);
    for (const row of resolved) {
      if (C.isUpper(row.unit)) continue;
      const pid = String(row.unit.id);
      bucket.partners.set(pid, (bucket.partners.get(pid) || 0) + 1);
    }
    perUpper.set(canonical, bucket);
  }
}

function round2(value) { return Math.round(value * 100) / 100; }
function percentiles(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const pick = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))] : 0;
  return {p10: round2(pick(0.1)), p25: round2(pick(0.25)), p50: round2(pick(0.5)), p75: round2(pick(0.75))};
}

const MIN_GAMES = 30; // 표본 30판 미만 상위는 분포를 신뢰하지 않는다
const byUpper = {};
for (const canonical of [...perUpper.keys()].sort()) {
  const bucket = perUpper.get(canonical);
  if (bucket.games < MIN_GAMES) continue;
  const roles = {};
  for (const key of ROLE_KEYS) roles[key] = percentiles(bucket.samples[key]);
  const partners = [...bucket.partners.entries()]
    .map(([id, games]) => ({id, name: (byId.get(id) || {}).name || id, share: round2(games / bucket.games * 100)}))
    .sort((a, b) => b.share - a.share || a.id.localeCompare(b.id))
    .slice(0, 8);
  byUpper[canonical] = {name: bucket.name, games: bucket.games, dualGames: bucket.dualGames, roles, partners};
}
const byFamily = {};
for (const family of [...perFamily.keys()].sort()) {
  const bucket = perFamily.get(family);
  const roles = {};
  for (const key of ROLE_KEYS) roles[key] = percentiles(bucket.samples[key]);
  byFamily[family] = {games: bucket.games, roles};
}

const digest = {
  version: 'clear-stats-v1',
  source: path.basename(inputPath),
  purpose: '표시·경고 전용 — 게이트·목표 자동 교체 금지 (최종 조합 데이터라 "무엇을"의 근거이지 "언제"의 근거가 아님)',
  records: records.length,
  usable,
  skipped: {noUpper: skippedNoUpper, unresolved: skippedUnresolved},
  minGames: MIN_GAMES,
  byUpper,
  byFamily
};

const body = 'window.ORD_CLEAR_STATS=' + JSON.stringify(digest) + ';\n';
const outPath = path.join(EXT, 'ord_clear_stats.js');
fs.writeFileSync(outPath, body);
console.log(`ord_clear_stats.js 생성: 판 ${records.length} · 사용 ${usable} · 상위 ${Object.keys(byUpper).length}종 · ${(body.length / 1024).toFixed(1)}KB`);
