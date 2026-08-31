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
const EXT = path.join(ROOT, 'archive','legacy_program');

// v22.11(사용자: "시즌 2 버전 기록들을 모두 보고"): 최신 파일 하나가 아니라
// 시즌 2 수집본 전부를 병합한다.  수집은 컷오프 구간별로 나뉘어 저장되므로
// (20260728 = 6/5~7/28, 20260811 = 8/3~ — 겹침 없음) 병합 = 시즌 2 전수다.
// 2.310/2.312 시대 클리어(스코퍼가반 등 신메타)가 다이제스트에 들어와
// 방향 자동 채택·실측 파트너·저격 감사가 현 메타를 따른다.
function allInputs() {
  const dir = path.join(ROOT, 'data');
  const all = fs.readdirSync(dir).filter((name) => /^tmo_nightmare_all_\d{8}\.json(\.gz)?$/.test(name)).sort();
  if (!all.length) throw new Error('data/tmo_nightmare_all_*.json(.gz) 없음');
  return all.map((name) => path.join(dir, name));
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

const inputPaths = process.argv[2] ? [process.argv[2]] : allInputs();
const data = { players: [], sources: [] };
for (const inputPath of inputPaths) {
  const rawBytes = fs.readFileSync(inputPath);
  const one = JSON.parse(inputPath.endsWith('.gz') ? zlib.gunzipSync(rawBytes).toString('utf8') : rawBytes.toString('utf8'));
  data.players.push(...(one.players || []));
  data.sources.push(path.basename(inputPath));
}

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

// v24.1(사용자: "제대로 추천을 못하면 의미가 없잖아"): 악몽 상위 2기
// 클리어 페어 코퍼스(data/nightmare_two_upper_*.json.gz, tmo /clear 전수)
// 를 정본 id 페어 판수로 병합한다.  페어 코퍼스의 코드는 tmo 웹 코드라
// 로컬 CODE_MAP 과 안 맞는다 — 이름+티어로 잇는다(세라핌 4기 포함,
// 99.3% 커버).  용도 경계는 위 purpose 와 동일 + 랭킹에서는 오직
// "동급(제작 가능·티어·처방 동일) 안의 타이브레이크"로만 쓴다.
function buildPairs() {
  const files = fs.readdirSync(path.join(ROOT, 'data')).filter((name) => /^nightmare_two_upper_\d{8}\.json(\.gz)?$/.test(name)).sort();
  if (!files.length) return null;
  const latest = path.join(ROOT, 'data', files[files.length - 1]);
  const rawBytes = fs.readFileSync(latest);
  const corpus = JSON.parse(latest.endsWith('.gz') ? zlib.gunzipSync(rawBytes).toString('utf8') : rawBytes.toString('utf8'));
  const TIER_WORDS = ['세라핌', '영원', '불멸', '초월', '제한됨'];
  const normName = (value) => String(value || '').split('(')[0].replace(/[^0-9A-Za-z가-힣\- ]/g, '').replace(/\s+/g, ' ').trim();
  const tierOf = (unit) => TIER_WORDS.find((tier) => String(unit.groupName || '').includes(tier)) || '';
  const pool = catalog.filter((unit) => C.isUpper(unit) || C.isSeraph(unit));
  const byNameTier = new Map(), byName = new Map();
  for (const unit of pool) {
    const base = normName(unit.name);
    if (!base) continue;
    const keyTier = base + '|' + tierOf(unit);
    if (!byNameTier.has(keyTier)) byNameTier.set(keyTier, []);
    byNameTier.get(keyTier).push(unit);
    if (!byName.has(base)) byName.set(base, []);
    byName.get(base).push(unit);
  }
  const resolveUnit = (name, tier) => {
    const base = normName(name);
    if (!base) return '';
    let list = byNameTier.get(base + '|' + String(tier || '')) || [];
    if (!list.length) {
      const candidates = byName.get(base) || [];
      const canon = new Set(candidates.map((unit) => String(C.canonicalUpperId(unit.id))));
      if (canon.size === 1) list = candidates;
    }
    return list.length ? String(C.canonicalUpperId(list[0].id)) : '';
  };
  const pairs = {};
  let resolvedGames = 0, skippedGames = 0;
  for (const row of corpus.pairRanking || []) {
    const a = resolveUnit(row.names && row.names[0], row.tiers && row.tiers[0]);
    const b = resolveUnit(row.names && row.names[1], row.tiers && row.tiers[1]);
    if (!a || !b) { skippedGames += row.count || 0; continue; }
    const key = [a, b].sort().join('|');
    pairs[key] = (pairs[key] || 0) + (row.count || 0);
    resolvedGames += row.count || 0;
  }
  const orderedPairs = {};
  for (const key of Object.keys(pairs).sort()) orderedPairs[key] = pairs[key];
  return {source: path.basename(latest), twoUpperGames: corpus.twoUpperCount || 0, resolvedGames, skippedGames, pairs: orderedPairs};
}
const pairStats = buildPairs();

const digest = {
  version: 'clear-stats-v1',
  source: data.sources.join(' + '),
  purpose: '표시·경고 전용 — 게이트·목표 자동 교체 금지 (최종 조합 데이터라 "무엇을"의 근거이지 "언제"의 근거가 아님)',
  records: records.length,
  usable,
  skipped: {noUpper: skippedNoUpper, unresolved: skippedUnresolved},
  minGames: MIN_GAMES,
  byUpper,
  byFamily,
  pairSource: pairStats ? pairStats.source : '',
  pairGames: pairStats ? pairStats.resolvedGames : 0,
  pairSkippedGames: pairStats ? pairStats.skippedGames : 0,
  pairs: pairStats ? pairStats.pairs : {}
};

const body = 'window.ORD_CLEAR_STATS=' + JSON.stringify(digest) + ';\n';
const outPath = path.join(EXT, 'ord_clear_stats.js');
fs.writeFileSync(outPath, body);
console.log(`ord_clear_stats.js 생성: 판 ${records.length} · 사용 ${usable} · 상위 ${Object.keys(byUpper).length}종 · 페어 ${Object.keys(digest.pairs).length}키/${digest.pairGames}판 · ${(body.length / 1024).toFixed(1)}KB`);
