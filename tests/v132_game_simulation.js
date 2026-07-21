'use strict';

// 결정적 회귀 시뮬레이션입니다. 실제 웨이브 전투나 드랍 확률을 흉내 내는
// 게임 엔진이 아니라, 명시한 가상 TMO 패를 코어와 최종 스쿼드 플래너에
// 통과시켜 1~65라 의사결정·재료 차감이 이어지는지 검증합니다.

const assert = require('assert');
const path = require('path');

const EXT = path.resolve(__dirname, '../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window = global;
for (const file of [
  'ord_units_data.js',
  'ord_upper_memo.js',
  'ord_synergy_memo.js',
  'ord_data_patch.js',
  'ord_core.js'
]) require(path.join(EXT, file));
const Planner = require(path.join(EXT, 'ord_squad_planner.js'));

const C = global.ORDCore;
const catalog = global.ORD_TMO_UNITS;
const db = C.buildDb(catalog);
const closestRare = db.byId.get('420h'); // 와이퍼: 스토리 점수와 무관한 완성도 우선 검증용
const closestLegend = db.byId.get('V20h'); // 스모커: 로져 재료로 이어지는 첫 전설
const chosenUpper = db.byId.get('J40h'); // 로져 불멸
assert(closestRare && closestLegend && chosenUpper, 'simulation fixtures are missing');

const percentages = Object.fromEntries(catalog.map(unit => [unit.id, 0]));
percentages[closestRare.id] = 99;
percentages[closestLegend.id] = 98;

// 반복 실행 시에도 같은 결과가 나오도록 확률 대신 고정 재고를 씁니다.
// 수치는 추천 로직 검증용이며 실제 1라 시작 패나 드랍 확률을 뜻하지 않습니다.
let counts = {};
for (const unit of catalog) {
  if (C.isCommon(unit)) counts[unit.id] = 14;
  else if (C.isUncommon(unit)) counts[unit.id] = 7;
  else if (C.isSpecialTier(unit)) counts[unit.id] = 4;
}
for (const id of Object.keys(C.SPECIAL_IDS)) counts[id] = 4;
counts[C.WISP_ID] = 35;

const upperLocks = [{ stage: 'upper', id: chosenUpper.id }];
const events = [];
const checkpoints = [];
const buildAudit = [];

function settings(round) {
  return {
    currentRound: round,
    mode: 'physical',
    magicRoute: 'auto',
    targetSquadCount: 9,
    superKumaOwned: true,
    recommendWarped: true
  };
}

function state(round) {
  return C.normalizeState(catalog, {
    source: 'fixture-tmo',
    at: 1_700_000_000_000 + round,
    counts,
    units: catalog.map(unit => ({ id: unit.id, tmoPercent: percentages[unit.id] })),
    currentAbilities: {}
  }, settings(round));
}

function nameOf(id) {
  return C.nameOf(db.byId.get(id)) || id;
}

function tierTotal(predicate) {
  return db.units.reduce((sum, unit) => sum + (predicate(unit) ? C.num(counts[unit.id]) : 0), 0);
}

function inventory(round) {
  const current = state(round);
  const progress = C.debugFixture().progressionCounts(current);
  return {
    rare: tierTotal(C.isRare),
    legend: progress.legend,
    upper: progress.upper,
    squad: progress.squad,
    wisp: current.wisp
  };
}

function recordCheckpoint(round, label, locks = []) {
  const current = state(round);
  const flow = C.gameFlow(current, locks, settings(round));
  const row = { round, label, flow, inventory: inventory(round) };
  checkpoints.push(row);
  return row;
}

function addUnit(id, amount, round, reason) {
  counts[id] = C.num(counts[id]) + amount;
  events.push({ round, kind: 'income', text: `${reason}: ${nameOf(id)} +${amount}` });
}

function applySolve(id, round, reason, expectedAction) {
  const current = state(round);
  const solve = C.recipeSolve(current.db, id, counts);
  assert.strictEqual(solve.hardMissing.length, 0, `${nameOf(id)} hard material missing`);
  assert(solve.wispCost <= C.num(counts[C.WISP_ID]), `${nameOf(id)} selection wisp shortage`);
  if (expectedAction) {
    assert.deepStrictEqual(solve.consumed, expectedAction.solve.consumed,
      `${nameOf(id)} must consume the stock left by the previous planned action`);
    assert.strictEqual(solve.wispCost, expectedAction.wispCost,
      `${nameOf(id)} selection wisp debit drifted from the plan`);
  }
  const beforeWisp = C.num(counts[C.WISP_ID]);
  counts = Object.assign({}, solve.stockAfter);
  counts[C.WISP_ID] = beforeWisp - solve.wispCost;
  counts[id] = C.num(counts[id]) + 1;
  assert(Object.values(counts).every(value => C.num(value) >= 0), 'negative material stock');
  const audit = {
    round,
    id,
    name: nameOf(id),
    reason,
    consumed: Object.assign({}, solve.consumed),
    wispCost: solve.wispCost,
    wispAfter: counts[C.WISP_ID]
  };
  buildAudit.push(audit);
  events.push({ round, kind: 'build', text: `${reason}: ${audit.name} 제작` });
  return audit;
}

function topConsumed(map, limit = 5) {
  return Object.entries(map || {})
    .sort((a, b) => C.num(b[1]) - C.num(a[1]) || nameOf(a[0]).localeCompare(nameOf(b[0]), 'ko'))
    .slice(0, limit)
    .map(([id, amount]) => `${nameOf(id)} ${amount}`)
    .join(' · ') || '직접 보유 재료 사용 없음';
}

function hasMissingNonWisp(solve) {
  return ['uncommon', 'special', 'rare', 'hard', 'other'].some(key =>
    Object.values(solve.missingByTier && solve.missingByTier[key] || {})
      .some(value => C.num(value) > 0));
}

function finalGradeMetrics(countMap, round) {
  const current = state(round);
  const spec = Planner._test.finalOnlySpec(current, countMap, 'physical');
  const profileSettings = Object.assign({}, settings(round), { _upperUnit: chosenUpper });
  const profile = C.clearProfileDetails(spec, 'physical', profileSettings);
  const deficit = C.deficits(spec, 'physical', profileSettings);
  const armorCurrent = C.num(profile.armorCurrent);
  const armorTarget = C.num(profile.armorTarget);
  const slowCurrent = C.num(deficit.control && deficit.control.slow);
  const slowTarget = C.num(profile.slowTarget);
  const stunCurrent = C.num(spec.stun);
  const stunTarget = C.num(profile.stunTarget) || 1.5;
  return {
    spec,
    profile,
    deficit,
    armorCurrent,
    armorTarget,
    slowCurrent,
    slowTarget,
    stunCurrent,
    stunTarget,
    armorMet: armorCurrent >= armorTarget,
    halfStunMet: stunCurrent >= 0.5,
    slowMet: slowCurrent >= slowTarget,
    fullStunMet: stunCurrent >= stunTarget,
    complete: deficit.clearRows.length === 0,
    excessStun: Math.max(0, stunCurrent - stunTarget)
  };
}

function evaluateFinalCandidate(candidate, round) {
  const solve = C.recipeSolve(state(round).db, candidate.id, counts);
  const feasible = solve.hardMissing.length === 0
    && !hasMissingNonWisp(solve)
    && solve.wispCost <= C.num(counts[C.WISP_ID]);
  if (!feasible) return Object.assign({}, candidate, { feasible: false, solve });
  const after = Object.assign({}, solve.stockAfter);
  after[C.WISP_ID] = C.num(counts[C.WISP_ID]) - solve.wispCost;
  after[candidate.id] = C.num(after[candidate.id]) + 1;
  return Object.assign({}, candidate, {
    feasible: true,
    solve,
    after,
    metrics: finalGradeMetrics(after, round)
  });
}

function compareFinalCandidate(a, b) {
  // 물딜 우선순위: 방깎 = 최소 0.5스턴 > 이감·광보잡 > 충분한 1.5스턴.
  // 1.5스턴은 클리어 하드 게이트가 아니라 마지막 안정 보강입니다.
  for (const key of ['complete', 'armorMet', 'halfStunMet', 'slowMet']) {
    if (a.metrics[key] !== b.metrics[key]) return Number(b.metrics[key]) - Number(a.metrics[key]);
  }
  if (a.metrics.complete && b.metrics.complete && a.metrics.excessStun !== b.metrics.excessStun)
    return a.metrics.excessStun - b.metrics.excessStun;
  const aArmorGap = Math.max(0, a.metrics.armorTarget - a.metrics.armorCurrent);
  const bArmorGap = Math.max(0, b.metrics.armorTarget - b.metrics.armorCurrent);
  if (aArmorGap !== bArmorGap) return aArmorGap - bArmorGap;
  const aSlowGap = Math.max(0, a.metrics.slowTarget - a.metrics.slowCurrent);
  const bSlowGap = Math.max(0, b.metrics.slowTarget - b.metrics.slowCurrent);
  if (aSlowGap !== bSlowGap) return aSlowGap - bSlowGap;
  return a.sourceRank - b.sourceRank || a.name.localeCompare(b.name, 'ko');
}

function assertClosestRecommendation(plan, expected, label) {
  assert(plan.actions.length > 0, `${label} recommendation is empty`);
  const maxCompletion = Math.max(...plan.rows.map(row => row.progress));
  const selected = plan.actions[0];
  assert.strictEqual(selected.progress, maxCompletion,
    `${label} must select the maximum TMO completion before other scores`);
  assert.strictEqual(selected.unit.id, expected.id,
    `${label} expected ${C.nameOf(expected)}, got ${C.nameOf(selected.unit)}`);
  assert.strictEqual(selected.feasible, true, `${label} fixture must be buildable`);
  return selected;
}

// 1~7라: TMO 완성도만으로 첫 희귀를 고릅니다. 낮은 스토리 점수의 와이퍼를
// 일부러 99%로 두어, 스토리 점수 기반 정렬이 다시 끼어들면 테스트가 실패합니다.
const rarePlan = C.recommendationPlan(state(7), [], settings(7), [], []);
assert.strictEqual(rarePlan.purpose, 'rare');
const selectedRare = assertClosestRecommendation(rarePlan, closestRare, 'first rare');
recordCheckpoint(7, '첫 희귀 추천 직전');
applySolve(selectedRare.unit.id, 7, `TMO 완성도 ${selectedRare.progress}% 1위`);
counts[C.WISP_ID] += 1;
events.push({ round: 7, kind: 'income', text: '7라 이내 첫 희귀 달성: 선택 위습 +1' });

// 14~15라: 돈도박 1장과 스토리 중간 보상 2장을 첫 전설 재료로 고정합니다.
const firstLegendParts = closestLegend.stuffs.map(stuff => stuff.id);
assert.strictEqual(firstLegendParts.length, 3, 'first legend fixture must use three rare parts');
addUnit(firstLegendParts[0], 1, 15, '돈도박 가상 보상');
addUnit(firstLegendParts[1], 1, 15, '스토리 7 가상 보상');
addUnit(firstLegendParts[2], 1, 15, '스토리 7 가상 보상');
const legendPlan = C.recommendationPlan(state(15), [], settings(15), [], []);
assert.strictEqual(legendPlan.purpose, 'story');
const selectedLegend = assertClosestRecommendation(legendPlan, closestLegend, 'first legend/hidden');
recordCheckpoint(15, '첫 전설 추천');
applySolve(selectedLegend.unit.id, 18, `TMO 완성도 ${selectedLegend.progress}% 1위`);
const r20 = recordCheckpoint(20, '첫 전설 완성 확인');
assert.strictEqual(r20.flow.legendSecured, true);

// 21~24라: 고도 3장, 스토리 잔여 3장, 일반 합성 1장으로 25라 희귀 8장을 만듭니다.
const excludedRewards = new Set([closestRare.id, ...firstLegendParts]);
const rewardPool = db.rares.filter(unit => !excludedRewards.has(unit.id)).slice(0, 7);
assert.strictEqual(rewardPool.length, 7, 'rare reward pool fixture is too small');
for (const unit of rewardPool.slice(0, 3)) addUnit(unit.id, 1, 21, '고도 가상 결과');
recordCheckpoint(21, '고도 반영');
for (const unit of rewardPool.slice(3, 6)) addUnit(unit.id, 1, 23, '스토리 8 잔여 가상 보상');
addUnit(rewardPool[6].id, 1, 24, '일반 합성');
assert.strictEqual(inventory(25).rare, 8, 'round 25 must start with eight rares');

// 25라: 첫 전설 스모커를 재료로 먹는 로져 불멸을 고정하고, 플래너가 실제로
// 9칸 전역 계획과 순차 차감표를 만드는지 검증합니다.
const r25 = recordCheckpoint(25, '물딜 상위 확정', upperLocks);
const squadPlan = Planner.planFinalSquad({
  state: state(25),
  settings: settings(25),
  locks: upperLocks,
  bottleneckCommons: ['우솝']
});
assert.strictEqual(squadPlan.mode, 'physical');
assert.strictEqual(squadPlan.targetCount, 9);
assert.strictEqual(squadPlan.projectedCount, 9);
assert.strictEqual(squadPlan.plannedCount, 9);
assert.strictEqual(squadPlan.complete, true);
assert.strictEqual(squadPlan.targetBoardCount, 7);
assert.strictEqual(squadPlan.projectedBoardCount, 7);
assert.strictEqual(squadPlan.plannedBoardCount, 7);
assert.strictEqual(squadPlan.finalLineup.length, 7);
assert.strictEqual(squadPlan.actions[0].id, chosenUpper.id,
  'locked Roger upper must be the first sequential action');
assert.strictEqual(squadPlan.actions.length, 7,
  'owned Smoker must be consumed into Roger, leaving seven real board actions');

const plannedNames = squadPlan.finalLineup.map(row => row.name);
const sequentialActions = squadPlan.actions.slice();

// 30라: 상위 1 + 라인 전설 1.
for (const action of sequentialActions.slice(0, 2))
  applySolve(action.id, 30, action === sequentialActions[0] ? '확정 상위' : '라인 방어 전설', action);
const r30 = recordCheckpoint(30, '상위 + 라인 전설', upperLocks);
assert.strictEqual(r30.inventory.upper, 1);
assert.strictEqual(r30.inventory.squad, 4);

// 40라: 중간 보강으로 5기.
for (const action of sequentialActions.slice(2, 5))
  applySolve(action.id, 40, '상위 결손 보강', action);
const r40 = recordCheckpoint(40, '중간 보강 · 환산 7기', upperLocks);
assert.strictEqual(r40.inventory.squad, 7);

// 50라: 마지막 한 칸을 남기고 8기.
for (const action of sequentialActions.slice(5, 6))
  applySolve(action.id, 50, '50라 전 보강', action);
const r50 = recordCheckpoint(50, '전설급 8기', upperLocks);
assert.strictEqual(r50.inventory.squad, 8);

// 55라: 25라 설계의 아홉 번째 행동과 네 가지 패치 메뉴를 같은 재고에서
// 다시 풉니다. 물딜 필수 스펙 충족 여부를 먼저 보고, 모두 충족한 후보끼리는
// 1.5를 넘는 초과 스턴이 가장 작은 후보를 선택합니다.
const beforePatch = recordCheckpoint(55, '최종 패치 직전', upperLocks);
assert.strictEqual(beforePatch.flow.phase, 'final-patch');
const patchPlan = Planner.planFinalSquad({
  state: state(55),
  settings: settings(55),
  locks: upperLocks,
  bottleneckCommons: ['우솝']
});
assert.deepStrictEqual(
  patchPlan.finalPatchOptions.map(option => option.kind),
  ['legendHidden', 'ship', 'rarePair', 'changed']
);
const plannedNinth = sequentialActions[6];
const finalCandidateInputs = [{
  id: plannedNinth.id,
  name: plannedNinth.name,
  label: '25라 설계 마지막 1기분',
  kind: 'planned',
  sourceRank: 0,
  expectedAction: plannedNinth
}];
for (const [index, option] of patchPlan.finalPatchOptions.entries()) {
  if (!option.id || option.kind === 'rarePair') continue;
  if (finalCandidateInputs.some(row => row.id === option.id)) continue;
  finalCandidateInputs.push({
    id: option.id,
    name: option.name,
    label: option.label,
    kind: option.kind,
    sourceRank: index + 1,
    expectedAction: null
  });
}
const evaluatedPatches = finalCandidateInputs.map(candidate => evaluateFinalCandidate(candidate, 55));
const readyPatches = evaluatedPatches.filter(candidate => candidate.feasible).sort(compareFinalCandidate);
assert(readyPatches.length > 0, 'a feasible planned or final-patch candidate is required by this fixture');
const chosenPatch = readyPatches[0];
applySolve(chosenPatch.id, 55, `클리어 스펙·초과 스턴 비교: ${chosenPatch.label}`,
  chosenPatch.expectedAction || undefined);
const afterPatch = recordCheckpoint(55, '최종 패치 완료', upperLocks);
assert.strictEqual(afterPatch.inventory.squad, 9);

const metrics55 = finalGradeMetrics(counts, 55);
assert.strictEqual(metrics55.deficit.clearRows.length, 0,
  `round 55 physical clear gaps: ${metrics55.deficit.clearRows.map(row => row.label).join(', ')}`);
assert(metrics55.armorCurrent >= metrics55.armorTarget, 'round 55 armor target');
assert(metrics55.slowCurrent >= metrics55.slowTarget, 'round 55 slow target');
assert(metrics55.stunCurrent >= 0.5, 'round 55 minimum stun target');
assert(metrics55.stunCurrent <= 2.05,
  `round 55 final-grade stun must avoid oversupply: ${metrics55.stunCurrent}`);
assert.strictEqual(afterPatch.flow.phase, 'upgrade-control');

// 56~65라: 최종 9기를 제외한 하위 재료를 판매한 것으로 처리합니다. 업그레이드
// 수치는 게임 외부 선택이므로 임의의 DPS 결과를 만들지 않고 코어의 제어 판정과
// 판매·업그레이드·컨트롤 단계 전환만 확인합니다.
let soldMaterialCount = 0;
for (const unit of db.units) {
  if (!(C.isCommon(unit) || C.isUncommon(unit) || C.isSpecialTier(unit) || C.isRare(unit))) continue;
  soldMaterialCount += C.num(counts[unit.id]);
  counts[unit.id] = 0;
}
events.push({ round: 56, kind: 'sell', text: `최종 조합 외 하위 재료 ${soldMaterialCount}기 판매 처리` });
events.push({ round: 56, kind: 'upgrade', text: '이감·공격력·체젠·마젠 업그레이드 및 유닛 컨트롤로 전환' });
const r65 = recordCheckpoint(65, '판매·업그레이드·컨트롤', upperLocks);
assert.strictEqual(r65.inventory.squad, 9);
assert.strictEqual(r65.flow.phase, 'upgrade-control', JSON.stringify({
  clearReady: r65.flow.clearReady,
  gaps: r65.flow.deficits && r65.flow.deficits.clearRows.map(row => [row.key, row.current, row.target])
}));
const finalState = state(65);
const finalMetrics = finalGradeMetrics(counts, 65);
const finalSpec = finalMetrics.spec;
const finalProfile = finalMetrics.profile;
const finalDeficit = finalMetrics.deficit;
assert.strictEqual(finalDeficit.clearRows.length, 0);
assert(finalProfile.armorCurrent >= finalProfile.armorTarget);
assert(finalMetrics.slowCurrent >= finalMetrics.slowTarget);
assert(finalSpec.stun >= 0.5);
assert(finalSpec.stun <= 2.05, `round 65 final-grade stun oversupply: ${finalSpec.stun}`);

function checkpointLine(row) {
  const inv = row.inventory;
  return `${String(row.round).padStart(2, ' ')}R | ${row.label} | 단계 ${row.flow.phase} | 희귀 ${inv.rare} · 전설 ${inv.legend} · 상위 ${inv.upper} · 최종급 ${inv.squad} · 선위 ${inv.wisp}`;
}

console.log('=== 원랜디 2.305 악몽 도우미 v13.4 결정적 1~65라 시뮬레이션 ===');
console.log('주의: 실제 전투·드랍 확률 시뮬레이터가 아니라 명시적 가상 TMO 패의 의사결정 회귀 테스트입니다.');
console.log(`7R 첫 희귀: ${C.nameOf(selectedRare.unit)} ${selectedRare.progress}% (후보 최대 ${Math.max(...rarePlan.rows.map(row => row.progress))}%)`);
console.log(`15R 첫 전설·히든: ${C.nameOf(selectedLegend.unit)} ${selectedLegend.progress}% (후보 최대 ${Math.max(...legendPlan.rows.map(row => row.progress))}%)`);
console.log('');
console.log('[체크포인트]');
for (const row of checkpoints) console.log(checkpointLine(row));
console.log('');
console.log('[25R 물딜 9기 설계]');
plannedNames.forEach((name, index) => console.log(`${index + 1}. ${name}`));
console.log(`현재 패 순차 제작 가능 ${squadPlan.projectedCount}/9 · 플래너 완성 ${squadPlan.complete ? '예' : '아니오'} · 예상 선위 ${squadPlan.resourceUse.wisp}`);
console.log('');
console.log('[25R 내 희귀함 사용 지도]');
for (const rare of squadPlan.rareAllocation.filter(row => row.initial > 0)) {
  const destinations = rare.usedBy.map(use => `${use.name} ${use.count}장(${use.label})`);
  if (rare.rerollSuggested && rare.remaining > 0) destinations.push(`남은 ${rare.remaining}장 리롤 권장`);
  console.log(`${rare.name} ${rare.initial}장 → ${destinations.join(' · ') || '보류'}`);
}
console.log(`합계 ${squadPlan.rareSummary.initial}장 = 즉시 사용 ${squadPlan.rareSummary.spent} · 후속 예약 ${squadPlan.rareSummary.reserved} · 리롤 ${squadPlan.rareSummary.reroll} · 중복 충돌 ${squadPlan.rareSummary.conflict}`);
console.log('');
console.log('[실제 순차 차감]');
for (const audit of buildAudit) {
  console.log(`${audit.round}R ${audit.name} | ${topConsumed(audit.consumed)} | 선위 -${audit.wispCost}, 잔여 ${audit.wispAfter}`);
}
console.log('');
console.log('[55R 최종 패치 메뉴]');
for (const option of patchPlan.finalPatchOptions)
  console.log(`${option.label}: ${option.name || (option.names || []).join(' + ') || '후보 없음'} [${option.status}]`);
console.log('[55R 실제 후보별 최종급 스펙 비교]');
for (const candidate of evaluatedPatches) {
  if (!candidate.feasible) {
    console.log(`${candidate.label}: ${candidate.name} [현재 재료로 제작 불가]`);
    continue;
  }
  const m = candidate.metrics;
  console.log(`${candidate.label}: ${candidate.name} | 방깎 ${m.armorCurrent.toFixed(2)}/${m.armorTarget} · 이감 ${m.slowCurrent.toFixed(2)}/${m.slowTarget} · 스턴 ${m.stunCurrent.toFixed(3)}/${m.stunTarget} · 필수 ${m.complete ? '충족' : '미달'}`);
}
console.log(`선택: ${chosenPatch.label} → ${chosenPatch.name} (필수 스펙 우선, 충족 후보 중 초과 스턴 최소)`);
console.log('');
console.log('[65R 최종 판정]');
console.log(`최종급 ${r65.inventory.squad}기 · 상위 ${r65.inventory.upper}기 · 물딜 준비도 ${finalDeficit.readiness}%`);
console.log(`방깎 ${finalMetrics.armorCurrent}/${finalMetrics.armorTarget} · 이감 ${finalMetrics.slowCurrent}/${finalMetrics.slowTarget} · 스턴 ${finalMetrics.stunCurrent.toFixed(3)}/${finalMetrics.stunTarget}`);
console.log(`제어 판정: ${finalDeficit.control.label} · 단계: ${r65.flow.phase}`);
console.log('[최종 9기]');
Planner._test.finalEntries(finalState, counts).forEach((unit, index) => console.log(`${index + 1}. ${nameOf(unit.id)}`));
console.log(`판매 처리한 하위 재료: ${soldMaterialCount}기`);
console.log('PASS  completion-first rare and legend recommendations');
console.log('PASS  nine-slot physical squad, rare allocation, and sequential material debit');
console.log('PASS  round-55 spec-ranked final patch with stun <= 2.05');
console.log('PASS  round-65 final-grade-only clear spec and upgrade/control handoff');
