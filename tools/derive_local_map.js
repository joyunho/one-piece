'use strict';

// v19.9.5(A안 3단계): 매핑 표본 → 로우코드 매핑 표 유도기.
//
// 입력: 연결 진단의 "매핑 표본 전체 복사"로 얻은 JSON 배열
//   [{at, live:{인게임코드:수량,...}, dom:{카탈로그id:수량,...}}, ...]
// 원리: 같은 순간의 두 수량 지도는 같은 패를 다른 이름으로 말한 것이다.
// 판이 진행되며 수량이 변하므로, 모든 표본에서 수량 궤적이 정확히 일치하는
// (로우코드, 카탈로그 id) 쌍만 살아남는다 — 궤적이 한 번이라도 다르면 탈락.
// 출력: 확정 매핑 / 다의(후보 여러 개) / 미해결 목록 + JS 매핑 표 초안.
//
// 사용: node tools/derive_local_map.js <samples.json>
const fs = require('fs');
const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'ord_tmo_auto_extension_v15_0_0_rebuild', 'ord_units_data.js'));
const units = global.ORD_TMO_UNITS;
const nameOf = new Map(units.map(u => [u.id, u.name]));
const knownIds = new Set();
for (const u of units) { knownIds.add(u.id); for (const c of u.codes || []) knownIds.add(String(c)); }

const file = process.argv[2];
if (!file) { console.error('사용법: node tools/derive_local_map.js <samples.json>'); process.exit(1); }
const samples = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(samples) || !samples.length) { console.error('표본이 비어 있습니다.'); process.exit(1); }

const RESOURCE = new Set(['GOLD', 'LUMBER', 'FOOD']);
const liveCodes = new Set();
const domIds = new Set();
for (const s of samples) {
  for (const k of Object.keys(s.live || {})) if (!RESOURCE.has(k)) liveCodes.add(k);
  for (const k of Object.keys(s.dom || {})) domIds.add(k);
}
console.log(`표본 ${samples.length}쌍 · 로우코드 ${liveCodes.size}종 · DOM 카탈로그 ${domIds.size}종`);

const liveAt = (s, r) => Number((s.live || {})[r]) || 0;
const domAt = (s, c) => Number((s.dom || {})[c]) || 0;

const direct = [], exact = {}, ambiguous = {}, unresolved = [];
const taken = new Set();
// 1) 코드가 카탈로그 id/코드와 그대로 일치하면 직결 — 수량 궤적도 검증한다.
for (const r of [...liveCodes].sort()) {
  if (!knownIds.has(r)) continue;
  const consistent = samples.every(s => liveAt(s, r) === domAt(s, r) || !(r in (s.dom || {})) === !(r in (s.live || {})) && liveAt(s, r) === domAt(s, r));
  direct.push({code: r, id: r, name: nameOf.get(r) || '', consistent: samples.every(s => liveAt(s, r) === domAt(s, r))});
  taken.add(r);
}
// 2) 나머지는 수량 궤적 전수 대조.
for (const r of [...liveCodes].sort()) {
  if (knownIds.has(r)) continue;
  const candidates = [];
  for (const c of domIds) {
    if (taken.has(c)) continue;
    let ok = true;
    for (const s of samples) { if (liveAt(s, r) !== domAt(s, c)) { ok = false; break; } }
    if (ok) candidates.push(c);
  }
  if (candidates.length === 1) { exact[r] = candidates[0]; }
  else if (candidates.length > 1) { ambiguous[r] = candidates; }
  else unresolved.push(r);
}

console.log(`\n=== 직결(코드=카탈로그 id) ${direct.length}종 ===`);
for (const row of direct) console.log(`  ${row.code} = ${row.name}${row.consistent ? '' : '  ⚠ 수량 궤적 불일치 — 확인 필요'}`);
console.log(`\n=== 궤적 대조 확정 ${Object.keys(exact).length}종 ===`);
for (const [r, c] of Object.entries(exact)) console.log(`  ${r} → ${c} (${nameOf.get(c) || '?'})`);
console.log(`\n=== 다의(표본 더 필요) ${Object.keys(ambiguous).length}종 ===`);
for (const [r, list] of Object.entries(ambiguous)) console.log(`  ${r} → ${list.slice(0, 6).map(c => `${c}(${nameOf.get(c) || '?'})`).join(' | ')}${list.length > 6 ? ' …' : ''}`);
console.log(`\n=== 미해결 ${unresolved.length}종 ===  ${unresolved.join(', ') || '없음'}`);

const table = {};
for (const row of direct) table[row.code] = row.id;
Object.assign(table, exact);
console.log('\n=== JS 매핑 표 초안 (ord_local_code_map.js 용) ===');
console.log('const ORD_LOCAL_CODE_MAP=' + JSON.stringify(table, null, 1) + ';');
