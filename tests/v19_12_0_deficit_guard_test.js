'use strict';
// v19.12.0 계약 — 0804 빅맘 단끝 패배(0804L)의 세 가드.
//
// 그 판의 기록: 31라에 이감 79/117로 정착 → 34~48라 15라운드 동안 승인
// 행동은 단끝 조각뿐, 회복(노리기) 안내 0, "0선위를 남겨 후속 필수 역할
// 경로를 보호합니다" 자기모순 문구, 47라+ 제작이 잔여 이감 기여 유닛을
// 재료로 소비(89→75).  최종 이감 75/117 · 1.5스턴 0.89/1.5 로 사망.
//
// ① ACT_NOW에서도 열린 필수 결손의 회복 목표가 계산·표시된다.
// ② 남은 선위로 결손을 못 닫으면 "보호합니다"라고 말하지 않는다.
// ③ 결손을 벌리는 제작은 승인 문구에 악화 경고를 단다.
// ④ closer 없는 필수 결손의 보유 기여 유닛 보호(protectCriticalBudget).
// ⑤ UI·부트 배선: 중간 합류 배너, 데스크톱 미수신 2상태, TMO% 문구,
//    특강 집계 표기, 런로그 미해석 코드 기록.
const assert=require('assert'),fs=require('fs'),path=require('path');
const lib=require('./lib/ordlog_replay.js');
const ROOT=path.join(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(EXT,file),'utf8');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

const engine=lib.loadEngine();
const catalog=global.ORD_TMO_UNITS;
const run=lib.loadRun('0804L');
const decideAt=round=>{
  const step=run.rounds.find(item=>item.round===round);
  assert(step,`0804L에 r${round} 없음`);
  return engine.decide({catalog,snapshot:step.snapshot,settings:step.settings,locks:step.locks});
};

check('① ACT_NOW에서도 회복 목표가 산다 (0804L r36 재현)',()=>{
  const decision=decideAt(36);
  assert.strictEqual(decision.state,'ACT_NOW','r36은 승인 상태여야 재현');
  const targets=decision.recovery&&decision.recovery.targets||[];
  assert(targets.length>=3,`승인 상태에서 회복 목표가 비어 있음 (${targets.length})`);
  // 앱 렌더러도 ACT_NOW를 더는 걸러내지 않는다.
  const app=read('ord_app.js');
  assert(!app.includes("status==='ACT_NOW'||status==='SYNC_BLOCKED'"),'렌더러가 여전히 ACT_NOW에서 회복 목표를 숨김');
  assert(app.includes("status==='SYNC_BLOCKED')return''"),'회복 렌더러 가드 소실');
});

check('② 선위 보호 문구 정직화 + ③ 결손 악화 경고 (r42 재현)',()=>{
  const decision=decideAt(42);
  const reason=String(decision.action&&decision.action.reason||'');
  assert(!/\b0선위를 남겨.*보호합니다/.test(reason),'"0선위를 남겨 보호" 자기모순 잔존');
  assert(/경고 — 남은 선위 \d+로는 열린 필수 결손 마감/.test(reason),`선위 부족 경고 없음: ${reason.slice(0,140)}`);
  assert(reason.includes('주의: 이 제작으로')&&reason.includes('더 벌어집니다'),`결손 악화 경고 없음: ${reason.slice(0,140)}`);
});

check('④ closer 없는 필수 결손의 보유 기여 보호 (protectCriticalBudget)',()=>{
  const src=read('ord_v15_engine.js');
  assert(src.includes('const starved=open.filter(req=>!closers.has(req.key))'),'starved 결손 분기 없음');
  assert(src.includes('keepsStarved'),'보유 기여 원장 비교 없음');
  assert(src.includes('starvedDropped'),'데드락 방지 복원 없음');
  // 완성도 0% 문구 — 보강 없는 판에 "0%로 가장 가깝습니다"라고 말하지 않는다.
  assert(src.includes('TMO 완성도 보강 없음'),'완성도 0 사유 문구 없음');
});

check('⑤ UI·부트 배선 — 중간 합류·데스크톱 2상태·TMO%·특강·런로그',()=>{
  const app=read('ord_app.js');
  assert(app.includes('중간 합류 감지')&&app.includes('v1912MidJoinBanner'),'중간 합류 배너 없음');
  assert(app.includes('TMO 프로그램 미연결')&&app.includes('게임 시작 대기 중 · TMO 프로그램 연결됨'),'데스크톱 미수신 2상태 없음');
  assert(app.includes('데스크톱 프로그램</b>(설치형 앱)')&&app.includes('tmo.gg 웹사이트를 여는 것으로는 연결되지 않습니다'),'데스크톱 가드 카피 없음');
  // v20.2: 보강 판정(v1912TmoEnriched)은 그대로 남지만, 그 결과가 더는
  // 막다른 "TMO% 보강 없음"이 아니다 — 사용자가 진행도를 아예 못 보게
  // 됐기 때문에("완성도 %가 안보이니까 불편한데") 코치 원장 계산값으로
  // 대체하고 이름·색으로 출처를 구분한다.  0%를 TMO 값인 척하지 않는다는
  // v19.12 의 원래 계약은 라벨 분리로 계속 지켜진다.
  assert(app.includes('v1912TmoEnriched')&&app.includes('v202Completion'),'보강 판정·완성도 대체 배선 없음');
  assert(app.includes("label:'코치 계산 재료 진행도'"),'대체 수치 라벨 없음');
  assert(app.includes('TMO 보강 없음(코치 원장 계산)'),'출처 고지 없음');
  assert(!app.includes("'TMO% 보강 없음'"),'막다른 표기가 되살아남');
  assert(app.includes('특강 기준')&&app.includes('집계'),'특강 집계 표기 없음');
  assert(app.includes('localDirect:snapshot.localDirect?{unknownCodes'),'런로그 미해석 코드 기록 없음');
  for(const boot of ['ord_boot_desktop.js','ord_boot_extension.js']){
    const src=read(boot);
    assert(src.includes('local.midJoin')&&src.includes('playableUnitCount >= 6'),`${boot} 중간 합류 감지 없음`);
    assert(src.includes('snapshot.localDirect.midJoin = true'),`${boot} midJoin 스냅샷 전달 없음`);
  }
  // v19.12.2(0805 실측 V40h): 시험 패널은 실전 경로(translate)로 판정하고
  // (원시 비교의 "미해석 13종" 과장 제거), 미해석 수량 궤적을 스냅샷·
  // 런로그에 실어 판 간 대조를 가능하게 한다.
  assert(app.includes('liveMatched')&&app.includes('미해석 코드만 실제 수량에서 빠집니다'),'시험 패널 실전 경로 판정 없음');
  assert(read('ord_local_code_map.js').includes('unknownCounts: Object.assign'),'스냅샷 unknownCounts 없음');
  assert(app.includes('unknownCounts:Object.assign({},snapshot.localDirect.unknownCounts'),'런로그 unknownCounts 없음');
  // v19.13(0804b 라운드 동결): 중간 합류 채택·꺼진 시계의 라운드 보정이
  // 시계를 켠다 — 명시적 멈춤(round-pause)만 예외.
  assert(app.includes('roundClockPausedByUser'),'명시적 멈춤 플래그 없음');
  const adoption=app.slice(app.indexOf('autoGeneration===0){'),app.indexOf('autoGeneration===0){')+900);
  assert(adoption.includes('auto.active===true&&!this.state.roundStartedAt')&&adoption.includes('elapsedToRoundStart'),'콜드 채택 시계 자동 시작 없음');
  const step=app.slice(app.indexOf("if(a==='round-step')"),app.indexOf("if(a==='round-pause')"));
  assert(step.includes("else if(this.state.roundClockPausedByUser!==true)this.state.roundStartedAt=Date.now()"),'꺼진 시계 라운드 보정이 시계를 안 켬');
  const pause=app.slice(app.indexOf("if(a==='round-pause')"),app.indexOf("if(a==='round-start')"));
  assert(pause.includes('roundClockPausedByUser=true'),'멈춤이 명시적 플래그를 안 세움');
});

console.log(`\n${checks} checks passed (v19.12.0 결손 가드 · 0804L)`);
