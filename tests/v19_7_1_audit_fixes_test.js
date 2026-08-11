'use strict';

// v19.7.1: 외부 감사 지적 5건의 수정 배선 고정.
//   ① 수치 교정은 v19_7_1_data_contract_test 가 데이터팩 대조로 잰다.
//   ② 상위 자동 확정 1/2 교착 — 같은 패 지속(하트비트만)에서도 4초 뒤 승격.
//   ③ 처방 2상위 안전 필터 — 계열 교차 제외·선행 막힘 확정 잠금.
//   ④ 플레이북 제한 가중치 — 플래너 후단 타이브레이크로만 연결(경계 유지).
//   ⑤ 보호 희귀 전량 표시.

const assert=require('assert');
const path=require('path');
const fs=require('fs');
const vm=require('vm');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const read=name=>fs.readFileSync(path.join(EXT,name),'utf8');
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}

const appSrc=read('ord_app.js');
const planner=read('ord_squad_planner.js');

// 런타임 준비.
const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const App=context.ORDApp.App,C=context.ORDCore;

check('② 같은 패가 4초 유지되면 1차 감지가 자동 확정으로 승격된다(런타임)',()=>{
  const now=Date.now();
  const appObj=Object.create(App.prototype);
  appObj.state={
    upperDetection:{candidateId:'Q40h',streak:1,lastSnapshotKey:'stable-key',lastSeenAt:now-5000},
    snapshot:{counts:{Q40h:1},bridgeAt:now-1000,at:now-1000},
    liveAt:now-1000,locks:[],mode:'',modeExplicit:false
  };
  appObj.upperLock=function(){return(this.state.locks||[]).find(lock=>lock.stage==='upper')||null;};
  appObj.catalogDb=()=>C.buildDb(context.ORD_TMO_UNITS);
  appObj.syncUpperMode=()=>false;
  appObj.setMessage=()=>{};
  assert.strictEqual(appObj.v197ConfirmStableUpper(),true,'지속 승격이 일어나지 않음');
  const lock=appObj.state.locks.find(l=>l.stage==='upper');
  assert(lock&&lock.id==='Q40h'&&lock.confirmations===2,'승격 잠금이 없음');
  // 연결이 죽어 있으면(liveAt 낡음) 승격 금지 — 낡은 데이터로 확정하지 않는다.
  const stale=Object.create(App.prototype);
  stale.state={upperDetection:{candidateId:'Q40h',streak:1,lastSnapshotKey:'k',lastSeenAt:now-5000},snapshot:{counts:{Q40h:1},bridgeAt:now-60000},liveAt:now-60000,locks:[]};
  stale.upperLock=function(){return null;};stale.catalogDb=appObj.catalogDb;stale.syncUpperMode=()=>false;stale.setMessage=()=>{};
  assert.strictEqual(stale.v197ConfirmStableUpper(),false,'연결 사망 상태에서 승격됨');
  // 4초 미만이면 아직 승격하지 않는다(파싱 깜빡임 보호 유지).
  const early=Object.create(App.prototype);
  early.state={upperDetection:{candidateId:'Q40h',streak:1,lastSnapshotKey:'k',lastSeenAt:now-1500},snapshot:{counts:{Q40h:1},bridgeAt:now-500},liveAt:now-500,locks:[]};
  early.upperLock=function(){return null;};early.catalogDb=appObj.catalogDb;early.syncUpperMode=()=>false;early.setMessage=()=>{};
  assert.strictEqual(early.v197ConfirmStableUpper(),false,'4초 전에 조기 승격됨');
  assert(appSrc.includes('this.v197ConfirmStableUpper()'),'시계 틱 배선 없음');
});

check('③ 처방 추천이 계열·선행조건 안전 필터를 탄다(소스 검증)',()=>{
  assert(appSrc.includes("if(family!=='neutral'&&family!==routeMode)continue;"),'계열 교차 필터 없음');
  assert(appSrc.includes('row.hardBlocked'),'선행 막힘 계산 없음');
  assert(/data-act="confirm-second-upper"[^>]*\$\{row\.hardBlocked&&row\.hardBlocked\.length\?`disabled/.test(appSrc),'선행 막힘 확정 잠금 없음');
  assert(appSrc.includes('선행 막힘 ·'),'선행 막힘 사유 표시 없음');
});

check('④ 처방 페어는 플래너 후단 타이브레이크로만 들어간다(경계 유지)',()=>{
  // 플래너는 플레이북 전역을 모른다 — 앱이 계열 필터를 거친 id 만 넘긴다.
  assert(!planner.includes('ORD_UPPER_PLAYBOOK'),'플래너가 플레이북 전역을 직접 참조');
  assert(planner.includes('function prescribedPairHold('),'처방 페어 타이브레이크 없음');
  assert(planner.includes('_prescribedSecondKeys'),'처방 키 전달 없음');
  // nodeCompare 순서: 관성(stickyUpperHeld) → 처방 페어 → 과잉 스턴.
  const sticky=planner.indexOf('num(a.stickyUpperHeld)!==num(b.stickyUpperHeld)');
  const presc=planner.indexOf('num(a.prescribedPairHeld)!==num(b.prescribedPairHeld)');
  const excess=planner.indexOf('num(a.excessStun)!==num(b.excessStun)');
  assert(sticky>=0&&presc>sticky&&excess>presc,'타이브레이크 순번이 어긋남 — 처방이 관성보다 앞서거나 점수 축에 들어감');
  // 앱이 계열 필터를 거쳐 넘긴다.
  assert(appSrc.includes('prescribedSecondUpperIds:this.v197PrescribedSecondIds()'),'앱 설정 전달 없음');
  assert(appSrc.includes('v197PrescribedSecondIds(){'),'전달 목록 계산 없음');
});

check('⑤ 보호 희귀가 전량 표시된다(v19.9: 표시 위치는 사용·보류 접이)',()=>{
  // v19.9: 다음 제작 레일의 보존 섹션은 사용자 요청으로 제거됐다.  감사
  // ⑤의 계약(보호 희귀를 4종에서 자르지 않는다)은 남는 희귀 패널의
  // 사용·보류 접이가 이어받는다 — 그곳은 전량 나열이고 절단이 없다.
  assert(!appSrc.includes('filter(row=>C.num(row.hold)>0).slice(0,4)'),'보호 희귀가 여전히 4종에서 잘림');
  assert(appSrc.includes("groups=[{key:'use',label:'사용'},{key:'hold',label:'보류'}]"),'사용·보류 접이가 사라짐');
  assert(appSrc.includes('rows.filter(row=>C.num(row[group.key])>0)'),'접이 전량 필터가 사라짐');
});

check('감사 기타 — snapshotHealth 숫자 번호 허용·루트 README 버전 부패 제거',()=>{
  const now=Date.now();
  const health=C.snapshotHealth({source:'tmo',parser:'ord-tmo-parser-v13-adapter',helperId:'54321',at:now,scanAt:now,bridgeAt:now,dataChangedAt:now,unitCount:324,collection:{found:true,confidence:.95},countDiscovery:{found:true,parsed:324,missing:0,ambiguous:0},wispCountFound:true},now);
  assert.strictEqual(health.ready,true,'임의 숫자 도우미가 상태 판정에서 거부됨');
  const readme=fs.readFileSync(path.resolve(__dirname,'../README.txt'),'utf8');
  assert(!/v?18\.9\.0|v18_9_0/.test(readme),'루트 README 에 낡은 버전이 남음');
});

console.log(`\n${checks}/${checks} audit fix checks passed.`);
