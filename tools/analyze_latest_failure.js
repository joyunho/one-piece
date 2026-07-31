'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'ord_tmo_auto_extension_v15_0_0_rebuild');
// v19.5(점검 결함): 기본값이 저장소 밖 특정 업로드 파일에 박혀 있어 새
// 환경에서는 인자 없이 항상 죽었다 — data/ 의 최신 ordlog 를 고른다
// (파일명에 타임스탬프가 있어 이름 내림차순 = 최신).
function latestOrdlog() {
  const dir = path.join(ROOT, 'data');
  const logs = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(name => name.endsWith('.ordlog.json')).sort()
    : [];
  if (!logs.length) throw new Error('data/*.ordlog.json 이 없습니다 — 로그 경로를 인자로 주세요');
  return path.join(dir, logs[logs.length - 1]);
}
const input = path.resolve(process.argv[2] || latestOrdlog());

global.window = global;
for (const file of [
  'ord_units_data.js',
  'ord_data_patch.js',
  'ord_core.js'
]) {
  require(path.join(EXT, file));
}

const Log = require(path.join(EXT, 'ord_run_log_compactor.js'));
const C = global.ORDCore;
const db = C.buildDb(global.ORD_TMO_UNITS);
const document = JSON.parse(fs.readFileSync(input, 'utf8'));

let baseline = null;
let previousKey = '';
const requestedFixtures = new Set(
  String(process.env.ORD_FIXTURE_SEQS || '')
    .split(',')
    .map(Number)
    .filter(Number.isFinite)
);
const fixtureStates = [];
const latestDecisionBySnapshot = new Map();
for (const event of document.events || []) {
  if (event.type === 'decision') latestDecisionBySnapshot.set(event.snapshotId, event);
}

function ownedRows(counts, predicate) {
  const rows = [];
  for (const unit of db.byId.values()) {
    const count = Number(counts[unit.id]) || 0;
    if (count > 0 && predicate(unit)) {
      rows.push(`${C.displayNameOf ? C.displayNameOf(unit) : C.nameOf(unit)}${count > 1 ? `×${count}` : ''}`);
    }
  }
  return rows;
}

for (const event of document.events || []) {
  if (event.type !== 'snapshot') continue;
  baseline = Log.applySnapshotRecord(baseline, event.payload, {digest: false});
  if (requestedFixtures.has(Number(event.seq))) {
    fixtureStates.push({
      round: event.round,
      seq: event.seq,
      counts: baseline.counts,
      progress: baseline.progress,
      currentAbilities: baseline.currentAbilities
    });
  }
  const rares = ownedRows(baseline.counts, C.isRare);
  const finals = ownedRows(
    baseline.counts,
    unit => (C.isUpper(unit) || C.isLegendish(unit)) && !C.isShip(unit)
  );
  const key = JSON.stringify({rares, finals, wisp: baseline.counts[C.WISP_ID] || 0});
  if (key === previousKey) continue;
  previousKey = key;
  const decision = latestDecisionBySnapshot.get(event.snapshotId);
  const action = decision && decision.payload && decision.payload.v15 && decision.payload.v15.action;
  const squad = decision && decision.payload && decision.payload.squad;
  const rare = squad && squad.rare;
  const prefix = (squad && squad.safePrefix && squad.safePrefix.actions || [])
    .map(item => item.name)
    .join(' → ');
  console.log(
    [
      `R${event.round}`,
      `seq=${event.seq}`,
      `wisp=${baseline.counts[C.WISP_ID] || 0}`,
      `rare(${rares.length})=${rares.join(', ') || '-'}`,
      `final=${finals.join(', ') || '-'}`,
      `recommend=${action && action.name || '-'}`,
      `squadPrefix=${prefix || '-'}`,
      rare
        ? `squadRare=${rare.owned || 0}/${rare.spent || 0}/${rare.hold || 0}/${rare.reroll || 0}`
        : ''
    ].filter(Boolean).join('\t')
  );
}

if (requestedFixtures.size) {
  console.log(`FIXTURES=${JSON.stringify(fixtureStates, null, 2)}`);
}
