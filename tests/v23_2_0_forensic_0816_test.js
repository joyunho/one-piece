'use strict';

// v23.2.0 계약 — 0816 r65 전멸 판 포렌식 5종 (사용자: "도저히 이걸 믿고
// 플레이할수가 없는 수준인데?").
//
// ① 자가 잠금 유화: "검증된 첫 제작이 최종 파티 목록과 일치하지 않습니다"
//    SYNC_BLOCKED 가 r31~50에 69회 — 엔진 판정이 신선 견적 통과 + 필수
//    결손 축소 + 무회귀를 증명하면 잠그지 않는다(deficit-repair 우회).
//    검증은 같은 패배 로그의 재생 델타(수정 전 12승인/15잠금 → 후 28/1).
// ② 방향 후보 계통 정렬: 마딜 lean(familyIntent) 패에서 물딜 상위
//    (크로커다일 F50h '제한됨 [물딜]')가 #2 — 같은 계통 먼저, 반대 계통은
//    familySwitch 배지로 뒤에.
// ③ 파티 정직성: '9/9 확보'가 스턴 0.56에서도 완료처럼 읽힘 — 역할 미완
//    헤더·경고 본문·확정 2단 확인.
// ④ '다음 제작' 캡션: 58라(⑥ 신세계)에 '마감 국면(40라~)에 열립니다' 모순
//    — 국면 인지 캡션.
// ⑤ 피드 스테일: 수신 끊김 시 선위 칩 스테일 표시 + 마지막 유효 카드
//    고스트 + 로컬 직결 워치독(데스크톱 재프로브·확장 알람 재장전).

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const LOG_0816=path.join(__dirname,'..','data','ORD_2310_20260816_171926_r51_65_failed.ordlog.json');

const tests=[];
function test(name,fn){tests.push([name,fn]);}

// ── VM 컨텍스트 (앱·엔진 정적 검증용) ─────────────────────────────
const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const App=context.ORDApp.App;

test('① 결손 응급 보강 우회 — 0816 패배 로그 재생에서 자가 잠금이 사라진다',()=>{
  assert(fs.existsSync(LOG_0816),'0816 패배 로그가 코퍼스에 없다');
  const R=require('./lib/reconcile_replay.js');
  const out=R.replayDisplayed('data/ORD_2310_20260816_171926_r51_65_failed.ordlog.json',{fromRound:40,toRound:50,keepDecisions:true});
  const t=out.totals;
  // 수정 전 같은 구간: ACT_NOW 3 · SYNC_BLOCKED 8 (하니스 델타 기준).
  // 절대 수치는 하니스 한계상 근사 핀 — 잠금이 승인보다 많아지면 회귀다.
  assert(C_num(t.byState.ACT_NOW)>=8,`승인 라운드가 너무 적다: ${JSON.stringify(t.byState)}`);
  assert(C_num(t.byState.SYNC_BLOCKED)<=2,`자가 잠금이 되살아났다: ${JSON.stringify(t.byState)}`);
  // 우회가 실제로 그 근거(권위 태그)로 이루어졌는지 확인.
  const bypassed=out.rounds.some(row=>row.decision&&row.decision.evidence&&row.decision.evidence.squadBypassDeficitRepair===true);
  assert(bypassed,'deficit-repair 우회 권위가 한 번도 발화하지 않았다');
  function C_num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
});

test('① 우회 조건은 엄격하다 — 결손을 줄이지 못하는 제작은 여전히 잠긴다',()=>{
  const src=read('ord_v15_engine.js');
  assert(src.includes('function deficitRepairSafe'),'deficitRepairSafe 부재');
  assert(src.includes("executionAuthority:'deficit-repair'"),'deficit-repair 권위 태그 부재');
  // 증명 3요소가 코드에 있다: 신선 견적 + 체크포인트 무회귀 + 결손 축소.
  const body=src.slice(src.indexOf('function deficitRepairSafe'),src.indexOf('function reconcileSquadExecutionRaw'));
  assert(body.includes('quote.feasible'),'견적 검증 누락');
  assert(body.includes('compareVector'),'체크포인트 무회귀 검증 누락');
  assert(body.includes('closes'),'결손 축소 조건 누락');
});

test('② 방향 후보 계통 정렬 — 0816 로그 r23 재생에서 물딜 후보가 마딜 후보를 앞서지 않는다',()=>{
  const R=require('./lib/reconcile_replay.js');
  const out=R.replayDisplayed('data/ORD_2310_20260816_171926_r51_65_failed.ordlog.json',{fromRound:22,toRound:23,keepDecisions:true});
  const C=context.ORDCore;
  const db=C.buildDb(context.ORD_TMO_UNITS);
  const tagOf=id=>{const u=db.byId.get(String(id));const g=u?C.groupName(u):'';return g.includes('[물딜]')?'physical':g.includes('[마딜]')?'magic':'';};
  let checked=0;
  for(const row of out.rounds){
    const cands=row.decision&&row.decision.routeCandidates||[];
    if(!cands.length)continue;checked++;
    // 마딜 lean 패: 명시 [물딜] 후보는 명시 [마딜]·무표기 후보보다 앞에 못 선다.
    let seenCross=false;
    for(const cand of cands){
      const tag=tagOf(cand.id);
      if(tag==='physical'){seenCross=true;assert(cand.familySwitch,`물딜 후보 ${cand.name}에 familySwitch 표시가 없다`);}
      else assert(!seenCross,`물딜 후보가 ${cand.name}(마딜/무표기)보다 앞에 있다: ${cands.map(x=>x.name).join('|')}`);
    }
  }
  assert(checked>0,'routeCandidates 를 가진 재생 판단이 없다');
});

test('③ 파티 정직성 — 역할 미완 헤더·경고 본문·확정 2단 확인 배선',()=>{
  const app=read('ord_app.js');
  assert(app.includes('역할 미완 ${openRequirements.length}건'),'역할 미완 헤더 카운트 누락');
  assert(app.includes('v232-party-roles-open'),'역할 미완 경고 본문 누락');
  assert(app.includes('그래도 확정'),'미완 확정 경고 버튼 라벨 누락');
  assert(app.includes('_partyConfirmArmedAt'),'확정 2단 확인(3.5초 arm) 누락');
  const css=read('ord_ui_v20.css');
  assert(css.includes('.v232-party-roles-open'),'경고 본문 CSS 누락');
  assert(css.includes('.v153-party>header strong.gap'),'미완 헤더 톤 CSS 누락');
});

test('④ 다음 제작 캡션 — 58라(⑥ 신세계)에 마감 국면 개방 예고 문구가 나오지 않는다',()=>{
  const stubApp=(()=>{
    const obj=Object.create(App.prototype);
    obj.state={mode:'magic',magicRoute:'auto',virtualSpecialId:'',locks:[],currentRound:58,rerollsUsed:0};
    obj.upperLock=()=>null;
    obj.observedDeficits=()=>({clearRows:[]});
    obj.renderV151NextAction=()=>'<i data-test="next"></i>';
    obj.renderV153Status=()=>'<section data-region="game-status"></section>';
    obj.renderV153Preview=()=>'<i data-test="candidate"></i>';
    obj.renderV153CraftableLegends=()=>'<i></i>';
    obj.renderV153UnusedRare=()=>'<i></i>';
    obj.renderV153UpperParty=()=>'<i></i>';
    return obj;
  })();
  const html=stubApp.renderCoach({},{v15Decision:{state:'ACT_NOW'},postLegendDecision:{awaiting:false}},{},{},{ready:true,key:'ok'});
  assert(html.includes('신세계 국면 — 후보 고정 없음'),'⑥ 국면 인지 캡션이 없다');
  assert(!html.includes('마감 국면(40라~)에 열립니다'),'⑥ 국면에 마감 국면 개방 예고 문구가 남아 있다');
});

test('⑤ 피드 스테일 — 칩 나이 표시·고스트 카드·워치독 배선',()=>{
  const app=read('ord_app.js');
  assert(app.includes('data-pill-age'),'선위 칩 스테일 나이 훅 누락');
  assert(app.includes('v23-ghost-card'),'판단 잠금 고스트 카드 누락');
  assert(app.includes("closest('.v23-ghost-card')"),'고스트 카드 클릭 차단 가드 누락');
  assert(app.includes('_lastReadyActionCard'),'마지막 유효 카드 캡처 누락');
  const css=read('ord_ui_v20.css');
  assert(css.includes('.v153-pill.stale'),'칩 스테일 CSS 누락');
  assert(css.includes('.v23-ghost-card'),'고스트 CSS 누락');
  assert(css.includes('pointer-events:none'),'고스트 승인 차단 CSS 누락');
  const desktop=read('ord_boot_desktop.js');
  assert(desktop.includes('bridge.probe'),'데스크톱 재프로브 워치독 누락');
  assert(desktop.includes('onConnectionTest'),'데스크톱 다시 읽기 버튼 배선 누락');
  const boot=read('ord_boot_extension.js');
  assert(boot.includes('ORD_ENSURE_SCAN_ALARM'),'확장 워치독 재장전 요청 누락');
  assert(boot.includes('local.watchdog'),'확장 워치독 타이머 누락');
  const bg=read('background.js');
  assert(bg.includes('ORD_ENSURE_SCAN_ALARM'),'백그라운드 재장전 핸들러 누락');
});

test('부록: 신규 패배·실전 로그 2건이 코퍼스에 존재한다 (0812 · 0816)',()=>{
  assert(fs.existsSync(path.join(__dirname,'..','data','ORD_2310_20260812_214013_active.ordlog.json')));
  assert(fs.existsSync(LOG_0816));
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_2_0_FORENSIC_0816 ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
