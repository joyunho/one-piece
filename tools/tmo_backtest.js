#!/usr/bin/env node
// 보조 유닛 추천의 정확도를 실측으로 평가한다.
//
// 지금까지 이 저장소에는 "추천이 좋아졌는지" 재는 방법이 없었다. 96,627판의
// 최종 파티가 있으니 잴 수 있다: 상위를 주고 보조를 가린 뒤, 모델이 뽑은
// 보조 목록이 실제 클리어 파티와 얼마나 겹치는지(recall@k).
//
// 시간 분할이 핵심이다 — 다이제스트는 "과거로 만들어 미래에 쓰는" 물건이므로
// 6월로 학습해 7월을 맞히게 한다. 같은 달로 학습·평가하면 과적합을 못 본다.
//
// 베이스라인을 반드시 함께 낸다. 큐레이션·레시피·DPS라는 복잡한 장치가
// "그냥 픽률 높은 순"을 못 이기면 그 복잡도는 값을 못 하고 있는 것이다.
//
// 사용: node --max-old-space-size=8192 tools/tmo_backtest.js [입력.json(.gz)]
//   --k 8            상위 k개 추천으로 평가(기본 8 — 파티 중앙 10에서 상위 제외)
//   --no-farm        학습·평가 모두에서 파밍 판(잔존 26+) 제외
//   --no-farm-train  학습에서만 제외(평가셋 고정) — 파밍 제거 효과의 공정한 측정
//   --scope legend   평가 대상 보조를 전설급으로 한정(기본 legend, all 가능)

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'archive','legacy_program');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(name);

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
const INPUT = process.argv.slice(2).find((a) => !a.startsWith('--') && /\.json(\.gz)?$/.test(a)) || latestInput();
const K = Number(arg('--k', '8')) || 8;
const DROP_FARM = has('--no-farm');
const DROP_FARM_TRAIN = has('--no-farm-train');
const SCOPE = arg('--scope', 'legend');
const FARM_UNITCOUNT = 26;

global.window = global;
require(path.join(EXT, 'ord_units_data.js'));
require(path.join(EXT, 'ord_data_patch.js'));
const catByCode = new Map();
for (const u of global.ORD_TMO_UNITS) for (const c of (u.codes || [])) catByCode.set(String(c).toLowerCase(), u);
const groupOf = (code) => {
  const cat = catByCode.get(String(code).toLowerCase());
  return cat ? String(cat.groupName || '') : '';
};
const isUpper = (g) => /^(제한됨|초월|불멸|영원)/.test(g);
// 평가 대상 보조: 판을 좌우하는 급만 본다. 흔함·재료까지 넣으면 아무 모델이나
// 높은 recall이 나와 변별력이 사라진다.
const isLegendish = (g) => /^(전설|히든|왜곡됨|변화된|세라핌|해적선)/.test(g);
const inScope = (g) => (SCOPE === 'all' ? !!g && !isUpper(g) : isLegendish(g));

const payload = readJson(INPUT);
const KST_MS = 9 * 3600 * 1000;
const monthOf = (iso) => new Date(Date.parse(iso) + KST_MS).toISOString().slice(0, 7);

const train = [];
const test = [];
for (const p of payload.players || []) {
  if (p.error) continue;
  for (const r of p.records || []) {
    if (r.difficulty !== '악몽') continue;
    const farm = Number(r.unitCount) >= FARM_UNITCOUNT;
    if (DROP_FARM && farm) continue;
    const codes = new Set();
    for (const u of r.units || []) if (u.code) codes.add(String(u.code).toLowerCase());
    const uppers = [...codes].filter((c) => isUpper(groupOf(c)));
    const supports = [...codes].filter((c) => inScope(groupOf(c)));
    if (!uppers.length || !supports.length) continue; // 상위 없는 판·보조 없는 판은 평가 불가
    const row = { uppers, supports };
    if (monthOf(r.createdAt) === '2026-06') {
      // 평가셋을 고정한 채 학습만 정제하면 "파밍 판 제거"의 순효과를 잴 수 있다.
      if (DROP_FARM_TRAIN && farm) continue;
      train.push(row);
    } else test.push(row);
  }
}
if (!train.length || !test.length) throw new Error(`분할 실패: train ${train.length} / test ${test.length}`);

// ── 학습(6월) ──────────────────────────────────────────────────────────────
const supportGames = new Map();   // code -> 등장 판수
const upperGames = new Map();     // upper -> 등장 판수
const pairGames = new Map();      // upper -> Map(support -> 동반 판수)
for (const g of train) {
  for (const s of g.supports) supportGames.set(s, (supportGames.get(s) || 0) + 1);
  for (const up of g.uppers) {
    upperGames.set(up, (upperGames.get(up) || 0) + 1);
    let m = pairGames.get(up);
    if (!m) pairGames.set(up, m = new Map());
    for (const s of g.supports) m.set(s, (m.get(s) || 0) + 1);
  }
}
const N = train.length;

// ── 모델들 ─────────────────────────────────────────────────────────────────
// 각 모델은 (상위 목록) → 점수 매긴 보조 후보 Map 을 만든다. 점수 상위 K개가 추천.
const models = {};

// 0) 인기순 — 상위를 아예 안 본다. 이걸 못 이기면 동반 데이터는 값을 못 한다.
models['인기순(베이스라인)'] = () => {
  const out = new Map();
  for (const [s, n] of supportGames) out.set(s, n);
  return out;
};

// 1) 현재 엔진 방식 — 동반 원시 판수 log + 전체 픽 log (ord_squad_planner clearAffinity)
models['현재(동반 판수)'] = (uppers) => {
  const out = new Map();
  const best = new Map();
  for (const up of uppers) for (const [s, k] of pairGames.get(up) || []) if (k > (best.get(s) || 0)) best.set(s, k);
  const codes = new Set([...best.keys(), ...supportGames.keys()]);
  for (const s of codes) {
    const pair = Math.min(0.8, 0.16 * Math.log10(1 + (best.get(s) || 0)));
    const pick = Math.min(0.2, 0.04 * Math.log10(1 + (supportGames.get(s) || 0)));
    out.set(s, pair + pick);
  }
  return out;
};

// 2) 조건부 확률 P(보조|상위) — 표본 크기에 불변인 비율
models['조건부 P(보조|상위)'] = (uppers) => {
  const out = new Map();
  for (const up of uppers) {
    const n = upperGames.get(up) || 0;
    if (!n) continue;
    for (const [s, k] of pairGames.get(up) || []) {
      const v = k / n;
      if (v > (out.get(s) || 0)) out.set(s, v);
    }
  }
  return out;
};

// 3) lift — 전체 평균 대비 몇 배 붙는가. 범용 픽을 걷어내고 그 상위 고유 조합을 본다.
models['lift'] = (uppers) => {
  const out = new Map();
  for (const up of uppers) {
    const n = upperGames.get(up) || 0;
    if (!n) continue;
    for (const [s, k] of pairGames.get(up) || []) {
      const cond = k / n;
      const base = (supportGames.get(s) || 0) / N;
      if (base <= 0) continue;
      const v = cond / base;
      if (v > (out.get(s) || 0)) out.set(s, v);
    }
  }
  return out;
};

// 4) 조건부 + 수축(shrinkage) — 표본이 적은 상위는 조건부가 튄다(1판 중 1판이면 100%).
// 전체 픽률 쪽으로 α판만큼 끌어당겨 안정시킨다. α는 "이만큼은 봐야 믿는다"의 뜻.
for (const alpha of [10, 30, 100]) {
  models[`조건부+수축 α=${alpha}`] = (uppers) => {
    const out = new Map();
    for (const up of uppers) {
      const n = upperGames.get(up) || 0;
      if (!n) continue;
      const m = pairGames.get(up) || new Map();
      // 후보는 그 상위와 붙은 적 있는 보조 ∪ 전체 상위 픽 — 미관측 보조도 기저값으로 평가된다.
      for (const s of supportGames.keys()) {
        const k = m.get(s) || 0;
        const base = (supportGames.get(s) || 0) / N;
        const v = (k + alpha * base) / (n + alpha);
        if (v > (out.get(s) || 0)) out.set(s, v);
      }
    }
    return out;
  };
}

// 5) 구현 후보 — planner.clearAffinity 의 함수형/출력범위를 그대로 두고 입력만
// 비율로 바꾼 것. clearAffinity 는 비교뿐 아니라 storyProxy 합산에도 쓰이므로
// 스케일이 바뀌면 다른 성분과의 균형이 흔들린다. 그래서 기준 판수(REF)를 곱해
// 현재 수치대를 보존한다 — log 는 단조라 순위는 조건부 모델과 같다.
// REF_TOTAL 은 현재 다이제스트 표본(12,035판)으로 고정해 pick 성분을 지금과 동일하게 둔다.
const REF_TOTAL = 12035;
// pick 성분(전체 픽률)이 pair 순위를 얼마나 흔드는지 — 상한을 낮춰 가며 잰다.
for (const pickCap of [0.2, 0.05, 0.02, 0]) {
  models[`구현안 pick상한=${pickCap}`] = (uppers) => {
    const out = new Map();
    const cond = new Map();
    for (const up of uppers) {
      const n = upperGames.get(up) || 0;
      if (!n) continue;
      for (const [s, k] of pairGames.get(up) || []) {
        const v = k / n;
        if (v > (cond.get(s) || 0)) cond.set(s, v);
      }
    }
    for (const s of new Set([...cond.keys(), ...supportGames.keys()])) {
      const pair = Math.min(0.8, 0.16 * Math.log10(1 + (cond.get(s) || 0) * 1300));
      const pick = pickCap <= 0 ? 0
        : Math.min(pickCap, (pickCap / 5) * Math.log10(1 + ((supportGames.get(s) || 0) / N) * REF_TOTAL));
      out.set(s, pair + pick);
    }
    return out;
  };
}
// Wilson 점수구간 하한 — 표본이 작을수록 아래로 끌어내려 "12판 중 6판 = 50%"가
// "1,200판 중 600판 = 50%"와 같은 대접을 받지 않게 한다. minGames 하드컷과 달리
// 절벽이 없다(표본이 늘면 점점 점추정으로 수렴).
function wilsonLower(k, n, z = 1.96) {
  if (!n) return 0;
  const p = k / n, z2 = z * z;
  const center = (p + z2 / (2 * n)) / (1 + z2 / n);
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return Math.max(0, center - margin);
}
models['조건부 Wilson 하한'] = (uppers) => {
  const out = new Map();
  for (const up of uppers) {
    const n = upperGames.get(up) || 0;
    if (!n) continue;
    for (const [s, k] of pairGames.get(up) || []) {
      const v = wilsonLower(k, n);
      if (v > (out.get(s) || 0)) out.set(s, v);
    }
  }
  return out;
};

// 최종 구현안 — pick 을 더하지 않고 "그 상위와 붙은 적 없는 보조"의 대체값으로만 쓴다.
// 동반 신호가 있는 보조끼리는 순수 조건부 순서(측정상 최적)를 그대로 유지하고,
// 동반 신호가 0인 보조들만 전체 픽률로 줄 세운다 — metaGamesOf 를 살려 두면서
// 순위를 흔들지 않는 유일한 배치다.
models['구현안 pick=미관측 대체만'] = (uppers) => {
  const out = new Map();
  const cond = new Map();
  for (const up of uppers) {
    const n = upperGames.get(up) || 0;
    if (!n) continue;
    for (const [s, k] of pairGames.get(up) || []) {
      const v = k / n;
      if (v > (cond.get(s) || 0)) cond.set(s, v);
    }
  }
  const PAIR_FLOOR = 0.16 * Math.log10(1 + (1 / 20000) * 1300); // 동반 1판 수준의 하한
  for (const s of new Set([...cond.keys(), ...supportGames.keys()])) {
    const c = cond.get(s) || 0;
    if (c > 0) out.set(s, Math.min(0.8, 0.16 * Math.log10(1 + c * 1300)));
    else out.set(s, Math.min(PAIR_FLOOR, 0.2 * ((supportGames.get(s) || 0) / N) * PAIR_FLOOR));
  }
  return out;
};

for (const refPair of [1300]) {
  models[`구현안 REF_PAIR=${refPair}`] = (uppers) => {
    const out = new Map();
    const cond = new Map();
    for (const up of uppers) {
      const n = upperGames.get(up) || 0;
      if (!n) continue;
      for (const [s, k] of pairGames.get(up) || []) {
        const v = k / n;
        if (v > (cond.get(s) || 0)) cond.set(s, v);
      }
    }
    for (const s of new Set([...cond.keys(), ...supportGames.keys()])) {
      const pair = Math.min(0.8, 0.16 * Math.log10(1 + (cond.get(s) || 0) * refPair));
      const pick = Math.min(0.2, 0.04 * Math.log10(1 + ((supportGames.get(s) || 0) / N) * REF_TOTAL));
      out.set(s, pair + pick);
    }
    return out;
  };
}

// 6) lift × 조건부 — lift 만 쓰면 희귀 조합이 상단을 먹는다. 실제 빈도로 눌러 준다.
models['lift×조건부'] = (uppers) => {
  const out = new Map();
  for (const up of uppers) {
    const n = upperGames.get(up) || 0;
    if (!n) continue;
    for (const [s, k] of pairGames.get(up) || []) {
      const cond = k / n;
      const base = (supportGames.get(s) || 0) / N;
      if (base <= 0) continue;
      const v = cond * Math.log10(1 + cond / base * 10);
      if (v > (out.get(s) || 0)) out.set(s, v);
    }
  }
  return out;
};

// ── 평가(7월) ──────────────────────────────────────────────────────────────
function topK(scores, k) {
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, k)
    .map(([code]) => code);
}

// 상위의 학습 표본 크기별 층 — 수축(shrinkage)은 표본 적은 상위에서만 값을 해야 한다.
// 층을 안 나누면 대형 상위가 평균을 지배해 그 효과가 묻힌다.
const STRATA = [
  { key: 'small', label: '학습<50판', test: (n) => n < 50 },
  { key: 'mid', label: '50~499판', test: (n) => n >= 50 && n < 500 },
  { key: 'large', label: '500판+', test: (n) => n >= 500 },
];
const strataOf = (uppers) => {
  const n = Math.max(...uppers.map((up) => upperGames.get(up) || 0));
  return (STRATA.find((s) => s.test(n)) || STRATA[0]).key;
};

const results = [];
for (const [name, model] of Object.entries(models)) {
  let recallSum = 0, precisionSum = 0, hitSum = 0, actualSum = 0, games = 0, covered = 0;
  const byStratum = new Map(STRATA.map((s) => [s.key, { sum: 0, n: 0 }]));
  const memo = new Map();
  for (const g of test) {
    const key = g.uppers.slice().sort().join('|');
    let picks = memo.get(key);
    if (!picks) { picks = topK(model(g.uppers), K); memo.set(key, picks); }
    if (!picks.length) continue;
    covered += 1;
    const set = new Set(picks);
    const hit = g.supports.filter((s) => set.has(s)).length;
    const st = byStratum.get(strataOf(g.uppers));
    if (st) { st.sum += hit / g.supports.length; st.n += 1; }
    recallSum += hit / g.supports.length;
    precisionSum += hit / picks.length;
    hitSum += hit;
    actualSum += g.supports.length;
    games += 1;
  }
  results.push({
    name,
    games,
    coverage: Number(((covered / test.length) * 100).toFixed(1)),
    recall: Number(((recallSum / games) * 100).toFixed(2)),
    precision: Number(((precisionSum / games) * 100).toFixed(2)),
    microRecall: Number(((hitSum / actualSum) * 100).toFixed(2)),
    strata: Object.fromEntries(STRATA.map((s) => {
      const v = byStratum.get(s.key);
      return [s.key, v && v.n ? Number(((v.sum / v.n) * 100).toFixed(2)) : null];
    })),
  });
}
results.sort((a, b) => b.recall - a.recall);

const base = results.find((r) => r.name === '인기순(베이스라인)');
console.log(`입력: ${path.basename(INPUT)}`);
console.log(`분할: 학습 6월 ${train.length.toLocaleString()}판 → 평가 7월 ${test.length.toLocaleString()}판`);
console.log(`설정: top-${K} 추천, 평가 대상 보조 = ${SCOPE === 'all' ? '상위 제외 전체' : '전설급(전설·히든·왜곡·변화·세라핌·해적선)'}` +
            `${DROP_FARM ? ', 파밍 판(잔존 26+) 제외' : ''}`);
console.log(`평가 판당 실제 보조 수 중앙값: ${(() => {
  const a = test.map((g) => g.supports.length).sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
})()}`);
console.log('');
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log(`${pad('모델', 22)} ${padL('recall@' + K, 10)} ${padL('precision', 10)} ${padL('micro', 8)} ${padL('커버리지', 9)} ${padL('vs 베이스', 10)}`);
console.log('-'.repeat(74));
for (const r of results) {
  const delta = base && r.name !== base.name ? `${r.recall - base.recall >= 0 ? '+' : ''}${(r.recall - base.recall).toFixed(2)}p` : '—';
  console.log(`${pad(r.name, 22)} ${padL(r.recall + '%', 10)} ${padL(r.precision + '%', 10)} ${padL(r.microRecall + '%', 8)} ${padL(r.coverage + '%', 9)} ${padL(delta, 10)}`);
}
console.log('');
const stratCount = new Map(STRATA.map((s) => [s.key, 0]));
for (const g of test) stratCount.set(strataOf(g.uppers), (stratCount.get(strataOf(g.uppers)) || 0) + 1);
console.log('상위 학습표본 크기별 recall (수축은 표본 적은 쪽에서만 값을 해야 한다)');
console.log(`${pad('모델', 22)} ${STRATA.map((s) => padL(`${s.label}(${stratCount.get(s.key)})`, 16)).join('')}`);
console.log('-'.repeat(74));
for (const r of results) {
  console.log(`${pad(r.name, 22)} ${STRATA.map((s) => padL(r.strata[s.key] === null ? '—' : r.strata[s.key] + '%', 16)).join('')}`);
}
console.log('');
console.log('해석: recall@k = 실제 파티의 전설급 보조 중 추천 top-k 안에 든 비율(판별 평균).');
console.log('      인기순을 못 이기는 모델은 동반 데이터를 쓸 이유가 없다.');
console.log('주의: 클리어 판만 있으므로 이 점수는 "승자와 얼마나 닮았나"이지 "클리어율을 올리나"가 아니다.');
