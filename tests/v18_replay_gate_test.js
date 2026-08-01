'use strict';

// v18 회귀 게이트 — 실전 로그 6판을 통째로 다시 돌린다.
//
// 지금까지 회귀 검증은 로그에서 문제가 된 라운드 한둘을 뽑아 fixture로
// 굳히는 방식이었다.  그 방식은 이미 아는 증상만 잡는다.  "68라운드 중
// 47라운드가 무응답"이나 "이긴 판인데 끝까지 unsafe" 같은 판 전체의
// 성질은 판을 통째로 돌려야 보인다.
//
// 여기서 지키는 것은 세 가지이고 전부 실측에서 나왔다.
//
//   ① 침묵 금지 — 어떤 라운드도 코치가 한마디도 못 하는 채로 지나가면
//      안 된다.  v17.28 기준 첫 클리어 로그는 47/68 라운드가 action null
//      이었고 r16~r32(17라운드)·r55~r68(14라운드)은 화면이 사실상 비었다.
//
//   ② 축 분리가 승패와 붙어 있다 — 생존 축이 뚫린 판은 지고, 첫 클리어는
//      화력 축이 미달인 채로 이겼다.  이 관계가 깨지면 축 분류가 틀린 것이다.
//      (v19.9.2 갱신: 0801 단끝 클리어가 첫 반례다 — 보수 회계 기준 생존
//      축을 끝까지 못 닫고도 이겼다.  축은 강한 신호지 법칙이 아니다.
//      아래 별도 테스트가 이 반례를 그대로 고정한다.)
//
//   ③ 마감 시점이 신호다 — 첫 클리어(0728c)만 50라 전에 생존 축을
//      닫았다(r49).  두 축을 모두 닫고도 진 0724는 r56에 닫았다.
//
// 이 테스트는 느리다(6판 × 60여 라운드를 살아 있는 엔진에 먹인다).
// 느린 값을 치르는 이유는 이게 이 프로젝트에서 유일하게 "판 전체가
// 어떻게 흘렀는가"를 재는 계측이기 때문이다.

const assert=require('assert');
const R=require('./lib/ordlog_replay.js');

let passed=0;
function test(name,fn){fn();passed+=1;console.log(`PASS ${name}`);}

// 6판을 한 번만 돌리고 결과를 공유한다.
const started=Date.now();
const results=R.RUNS.map(run=>R.replayRun(run.key));
const byKey=new Map(results.map(row=>[row.key,row]));
const clear=byKey.get('0728c');
const losses=results.filter(row=>row.outcome==='loss');
console.log(`replayed ${results.length} runs in ${Math.round((Date.now()-started)/1000)}s`);
for(const row of results){
  const t=row.totals;
  console.log(`  ${row.key} ${row.outcome} rounds=${t.rounds} mute=${t.muteRounds.length} unafford=${t.unaffordableRounds.length} survivalClosed=${t.survivalClosedRounds.length} onTime=${t.onTimeRounds.length} ${JSON.stringify(t.byConfidence)}`);
}

test('엔진이 라운드마다 반드시 무언가를 말한다 (침묵 금지)',()=>{
  for(const run of results){
    assert.strictEqual(run.totals.errors,0,`${run.key}: 재생 중 예외 ${run.totals.errors}건`);
    assert.deepStrictEqual(run.totals.muteRounds,[],
      `${run.key}: 코치가 아무 말도 못 한 라운드 ${run.totals.muteRounds.join(',')}`);
  }
});

test('감당 못 할 목표를 다음 행동이라고 부르지 않는다',()=>{
  // 침묵을 없애다가 거짓말로 바꾸면 더 나쁘다.  방향 미확정 구간에서
  // 후보의 첫 스텝을 못 찾으면 상위 유닛 자신으로 폴백하던 시절, 첫
  // 클리어 로그 r16~r23은 선위 11을 든 사용자에게 선위 32짜리 상위를
  // 여덟 라운드 연속 "다음 행동"으로 내밀었다.  지목할 게 없으면
  // 지목하지 않고 무엇이 얼마나 모자란지를 말한다.
  for(const run of results){
    // 승인해 놓고 못 만드는 것은 그냥 버그다.
    assert.deepStrictEqual(run.totals.unaffordableApprovedRounds,[],
      `${run.key}: '확정'으로 승인했는데 지금 선위로 못 만드는 라운드 ${run.totals.unaffordableApprovedRounds.join(',')}`);
    // 모으는 중이라고 말하는 건 정당하지만, 얼마나 모자란지는 반드시 같이 나와야 한다.
    assert.deepStrictEqual(run.totals.unaffordableUnexplainedRounds,[],
      `${run.key}: 못 만드는 목표를 부족량 없이 지목한 라운드 ${run.totals.unaffordableUnexplainedRounds.join(',')}`);
  }
  // 방향 미확정 구간에서 감당 불가 상위를 "다음 행동"이라 부르던 회귀는
  // 클리어 로그에서 여덟 라운드였다.  그 국면에서는 0이어야 한다.
  const direction=clear.rounds.filter(row=>row.confidenceKey==='fallback'&&row.unaffordable);
  assert.deepStrictEqual(direction.map(row=>row.round),[],
    `방향 국면에서 감당 불가 목표를 지목했다: ${direction.map(row=>row.round).join(',')}`);
});

test('확신 등급이 모든 라운드에 붙는다',()=>{
  for(const run of results){
    const missing=Object.keys(run.totals.byConfidence).filter(key=>key==='-'||!key);
    assert.deepStrictEqual(missing,[],`${run.key}: 확신 등급 없는 라운드가 있다`);
    for(const key of Object.keys(run.totals.byConfidence))
      assert(['approved','likely','fallback','operations'].includes(key),`${run.key}: 알 수 없는 확신 등급 '${key}'`);
  }
});

test('생존 축이 이긴 판과 진 판을 가른다',()=>{
  const clearClosed=clear.totals.survivalClosedRounds.length;
  assert(clearClosed>0,'클리어한 판이 생존 축을 한 번도 못 닫았다면 축 분류가 틀렸다');
  // 진 판 5개 중 생존 축을 닫아 본 판은 0724 하나뿐이고 그것도 클리어보다
  // 훨씬 짧았다.  "대부분의 패배는 생존 축을 못 닫아서"라는 관계가 유지돼야 한다.
  const closedLosses=losses.filter(run=>run.totals.survivalClosedRounds.length>0);
  assert(closedLosses.length<=1,
    `생존 축을 닫고도 진 판이 ${closedLosses.length}개다 — 생존 축이 승패를 설명하지 못한다`);
  for(const run of losses)
    assert(run.totals.survivalClosedRounds.length<clearClosed,
      `${run.key}(패)가 클리어한 판보다 생존 축을 오래 유지했다`);
});

test('50라 마감 전에 생존 축을 닫은 판은 클리어한 판뿐이다',()=>{
  assert(clear.totals.onTimeRounds.length>0,
    '클리어한 판이 마감 전 확보로 잡히지 않는다 — 마감 신호가 무의미하다');
  for(const run of losses)
    assert.deepStrictEqual(run.totals.onTimeRounds,[],
      `${run.key}(패)가 마감 전 확보로 잡혔다 — 오탐이다`);
});

test('첫 클리어는 화력 축 미달인 채로 끝났다 (요구치를 낮추지 않았다는 증거)',()=>{
  const last=clear.rounds[clear.rounds.length-1];
  assert.strictEqual(last.survivalPass,true,'클리어 마지막 라운드에 생존 축이 열려 있다');
  assert.strictEqual(last.firepowerPass,false,
    '화력 축이 통과로 바뀌었다 — 요구치를 낮춰 초록불을 켠 것이라면 이 테스트의 의미가 사라진다');
  assert.strictEqual(last.status,'firepower-open',`마지막 판정이 '${last.status}'다`);
});

test('둘째 클리어(0801 단끝)는 생존 축이 열린 채 이겼다 — 축은 강한 신호지 법칙이 아니다',()=>{
  // v19.9.1 실측: (S)타시기 단끝 클리어는 보수 회계(발동이감 절반 크레딧 ·
  // 나스쥬로 117 목표) 기준 이감 90/117 · 스턴 1.01/1.5 로 생존 축을 끝까지
  // 닫지 못한 채 이겼다.  이 판이 증명하는 것: 단끝 화력이 충분하면 제어
  // 미달을 딜로 덮을 수 있다(사용자의 물딜 방깎 논리와 같은 구조).  증명하지
  // 않는 것: 생존 축을 무시해도 된다는 것 — 진 판 6개 중 5개는 여전히 생존
  // 축을 한 번도 못 닫고 죽었고, 요구치는 그대로 유지한다.
  const second=byKey.get('0801c');
  assert(second,'0801c 재생 결과가 없다');
  assert.strictEqual(second.outcome,'clear');
  assert.deepStrictEqual(second.totals.survivalClosedRounds,[],
    '이 판이 생존 축을 닫은 것으로 잡히면 반례 기록이 사라진다 — 회계가 바뀌었는지 확인하라');
  const last=second.rounds[second.rounds.length-1];
  assert.strictEqual(last.survivalPass,false,'마지막 라운드 생존 축이 닫혀 있다 — 이 판의 교훈이 사라진다');
});

console.log(`V18_REPLAY_GATE ${passed}/7 passed`);
