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
  assert(app.includes('v1912TmoEnriched')&&app.includes('TMO% 보강 없음'),'TMO% 보강 없음 표기 없음');
  assert(app.includes('특강 기준')&&app.includes('집계'),'특강 집계 표기 없음');
  assert(app.includes('localDirect:snapshot.localDirect?{unknownCodes'),'런로그 미해석 코드 기록 없음');
  for(const boot of ['ord_boot_desktop.js','ord_boot_extension.js']){
    const src=read(boot);
    assert(src.includes('local.midJoin')&&src.includes('playableUnitCount >= 6'),`${boot} 중간 합류 감지 없음`);
    assert(src.includes('snapshot.localDirect.midJoin = true'),`${boot} midJoin 스냅샷 전달 없음`);
  }
});

console.log(`\n${checks} checks passed (v19.12.0 결손 가드 · 0804L)`);
