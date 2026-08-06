'use strict';
// v20.3.0 계약 — 회귀 게이트 정책.
//
// 근거 로그: data/ORD_2310_20260806_125925 (A) · _134555 (B).  두 판의
// 게이트 발화 173건을 전수 재계산해서 나온 사실:
//   · 173건 전부 무언가 필수 역할을 닫아 준다(닫아 주는 것 없이 벌리기만
//     하는 발화 0건).
//   · 게이트가 지킨 역할은 173건 전부 파티 계획 완성 시점에도 안 닫힌다
//     → "계획이 회복하면 통과" 규칙은 0/173 을 구한다(무용).
//   · 145건은 순이득 양수, 153건은 이미 마감을 넘긴 뒤 발화, 125건은
//     원시 v15 1순위와 같은 대상이었다.
//   · 최종 결과: 지킨 이감 80/102 · 광보잡 0/2 — 못 닫았다.
// 그러나 정당한 차단도 실측으로 확인됐다:
//   · B r47~r53 히바리3 — 베이비5·브룩·아카이누를 먹어 광보잡 2/2 → 0/2.
//     사용자가 r53 에 실제로 만들자 스냅샷에서 정확히 그대로 벌어졌고
//     판 끝까지 회복되지 않았다.
//   · B r46~r47 시저 — 이감 65→60 · 광보잡 2→1 예측이 실측과 일치.
//
// 그래서 정책은 "행 하나라도 나빠지면 차단"이 아니라 **정책 모듈이 이미
// 쓰는 우선순위 벡터가 뒤로 갔을 때만 차단**이다.
//
// ① 판별자는 새로 만들지 않는다 — P.compareVector 를 쓴다.
// ② 통과시킬 때도 회귀를 숨기지 않는다.
// ③ 막을 때도 화면은 비지 않는다(v17.28 계약 유지).
// ④ 실측 정답 대조 — 유해가 확인된 것은 막고, 순이득이 큰 것은 통과한다.
const assert=require('assert'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(EXT,file),'utf8');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

const lib=require('./lib/ordlog_replay.js');
lib.loadEngine();
const P=global.ORDV15Policy;

check('① 판별자는 정책 모듈의 우선순위 벡터다 — 게이트 전용 기준 금지',()=>{
  const src=read('ord_v15_engine.js');
  // 두 벡터 중 하나라도 뒤로 가면 차단.
  assert(/const vectorLoss=regressed\.length\?\(P\.compareVector\(after\.fullVector,before\.fullVector\)>0\|\|P\.compareVector\(after\.checkpointVector,before\.checkpointVector\)>0\):false/.test(src),
    '우선순위 벡터 판정이 없음');
  // 옛 정책(행 하나라도 악화 → 즉시 차단)이 되살아나면 안 된다.
  assert(!/if\(regressed\.length\)\{[\s\S]{0,200}return blocked\('HOLD',`최종 파티 첫 제작이 현재 필수 역할을 악화시킵니다/.test(src),
    '행 단위 즉시 차단이 되살아남');
  assert(src.includes('if(regressed.length&&vectorLoss){'),'차단 조건에 벡터 판정이 안 걸림');
  assert(typeof P.compareVector==='function','정책 모듈이 compareVector 를 안 내보냄');
});

check('② 통과시킬 때도 회귀를 숨기지 않는다',()=>{
  const src=read('ord_v15_engine.js'),app=read('ord_app.js'),css=read('ord_ui_v20.css');
  assert(src.includes("verdict:'passed-vector-gain'"),'통과 판정 표기 없음');
  assert(/headline:`\$\{regressed\.join\(' · '\)\}이\(가\) 나빠집니다/.test(src),'무엇이 나빠지는지 문장이 없음');
  assert(src.includes('regression:regressionNote'),'승인 행동에 회귀가 안 실림');
  assert(src.includes('regressionVerdict:regressedRows.length?')," 근거에 판정이 안 실림");
  // 화면에도 떠야 한다 — 근거만 만들고 안 보여 주면 숨긴 것과 같다.
  assert(app.includes('v203-regress-warn'),'승인 카드 회귀 고지 마크업 없음');
  assert(app.includes('const action=decision&&(decision.action||decision.blockedAction),reg=action&&action.regression;'),'회귀 읽기 배선 없음');
  assert(css.includes('.v203-regress-warn{'),'회귀 고지 스타일 없음');
  // 경고색이되 차단색이 아니다(승인은 유지된다).
  assert(css.includes('.v203-regress-warn b{color:var(--warn)'),'회귀 고지가 경고색이 아님');
});

check('③ 막을 때도 화면은 비지 않는다 — v17.28 계약 유지',()=>{
  const src=read('ord_v15_engine.js');
  assert(/return blocked\('HOLD',`최종 파티 첫 제작이 우선순위 상 더 급한 역할을 되돌립니다[\s\S]{0,140}regressCandidate\)/.test(src),
    '차단 시 표시 후보를 안 넘김');
  assert(src.includes('regression:regressedRows'),'차단 후보에 회귀 수치가 안 실림');
  assert(src.includes("regressionVerdict:'blocked-vector-loss'"),'차단 판정 표기 없음');
});

check('④ 실측 정답 대조 — 유해는 막고 순이득은 통과한다',()=>{
  // 실제 판정식을 그대로 재현해, 0806 두 판의 대표 사례에서 기대한
  // 방향으로 갈리는지 확인한다.  (전수 173건 재계산은 무거워서 계약
  // 테스트에 넣지 않는다 — 여기서는 판정식 자체의 성질을 고정한다.)
  const decide=(before,after)=>P.compareVector(after.fullVector,before.fullVector)>0||P.compareVector(after.checkpointVector,before.checkpointVector)>0;
  // 벡터가 앞으로 간 경우(카벤딧슈 계열: 최우선 그룹을 닫고 후순위가 조금 나빠짐)
  assert.strictEqual(decide({fullVector:[3,2],checkpointVector:[2,1]},{fullVector:[2,3],checkpointVector:[1,2]}),false,
    '최우선이 개선됐는데 차단함');
  // 벡터가 뒤로 간 경우(히바리 계열: 닫혀 있던 상위 그룹을 부숨)
  assert.strictEqual(decide({fullVector:[1,0],checkpointVector:[1,0]},{fullVector:[2,0],checkpointVector:[1,0]}),true,
    '상위 그룹이 나빠졌는데 통과함');
  assert.strictEqual(decide({fullVector:[1,0],checkpointVector:[0,0]},{fullVector:[1,0],checkpointVector:[1,0]}),true,
    '체크포인트 벡터가 나빠졌는데 통과함');
  // 완전히 같으면 차단하지 않는다(변화 없음은 회귀가 아니다).
  assert.strictEqual(decide({fullVector:[1,1],checkpointVector:[1,1]},{fullVector:[1,1],checkpointVector:[1,1]}),false,
    '변화 없는데 차단함');
});

check('⑤ 회귀 행에 판단 재료가 전부 실린다',()=>{
  const src=read('ord_v15_engine.js');
  for(const field of ['key:String(row.key','label:String(row.label','axis:String(row.axis','target:num(row.target',
    'gapBefore:num(row.gap','gapAfter:num(next.gap','currentBefore:num(row.current','currentAfter:num(next.current',
    'brokeClosed:num(row.gap)<=1e-9'])
    assert(src.includes(field),`회귀 행 필드 누락: ${field}`);
  // 로그에도 남아야 나중에 다시 잴 수 있다(이번 진단이 blockedAction 미기록
  // 때문에 못 센 것과 같은 실수를 반복하지 않는다).
  assert(src.includes('regressionDetail:regressedRows'),'근거에 회귀 상세가 안 실림');
});

check('⑥ 재생 하니스가 화면 판단을 잰다 — 재는 곳과 보는 곳이 같아야 한다',()=>{
  // 이번 진단에서 드러난 맹점: tests/lib/ordlog_replay.js 는 engine.decide()
  // 만 불러서 reconcile 안의 게이트를 한 번도 보지 못했다.  0806b 판단의
  // 31%가 그 게이트에 막혔는데 어떤 재생 지표에도 안 잡혔다.
  const R=require('./lib/reconcile_replay.js');
  assert(typeof R.replayDisplayed==='function','화면 판단 재생기가 없음');
  const src=fs.readFileSync(path.join(ROOT,'tests/lib/reconcile_replay.js'),'utf8');
  assert(src.includes('reconcileSquadExecution'),'재생기가 reconcile 을 안 부름');
  assert(/충실도 한계/.test(src),'재생기의 한계 고지가 없음');
  // 0806 두 판이 재생 목록에 등록되어 있어야 회귀를 계속 잴 수 있다.
  const runs=lib.RUNS.map(run=>run.key);
  for(const key of ['0806a','0806b'])assert(runs.includes(key),`재생 목록에 ${key} 없음`);
});

console.log(`\n${checks} checks passed (v20.3.0 — 회귀 게이트 정책)`);
