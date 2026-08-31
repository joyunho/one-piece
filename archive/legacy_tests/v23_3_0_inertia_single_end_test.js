'use strict';

// v23.3.0 계약 — #56 관성 착수 + 마딜 단끝 경로 일시 중단 (사용자 지시).
//
// 사용자: "#56 관성 착수해  그리고 당분간은 마딜 1상위 단끝딜 추천하지
// 말아봐" (0816 타시기 · 0817 아카이누 — 두 판 연속 단끝 경로 전멸).
//
// ① 관성(현직 우위): 추천 카드 대상은 ⓐ탐색층(stickyPath) — 도전자가
//   안전 성분(회귀·체크포인트·막다른길)에서 엄격히 이겨야만 교체,
//   ⓑ승격층(squad-prefix) — 직전 대상이 미제작·비veto·신선 재견적 통과·
//   결손 축소·무회귀면 프리픽스 첫수가 바뀌어도 유지.
//   실측 핀: 0817 패배 로그 재생 28~52라 타깃 교체 12회 → 5회 이하.
// ② 단끝 중단: 자동 판정·차선·플래너 기본에서 singleEnd 제외.
//   명시 선택과 패왕의길·계엄령(2상위 불가) 강제는 그대로.
// v26.5(사용자 0826: "단일 끝딜 1상위 마딜 제한 풀어줘 2상위도 되고
//   이제 모두 다 되게"): ② 중단 해제 — 이 파일의 ② 절은 해제 계약으로
//   재핀됐다(auto 재비교·차선 부활·플래너 비교·단끝 상위 2 슬롯).

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,M=context.ORDV15Model,E=context.ORDV15Engine,P=context.ORDSquadPlanner;
const units=context.ORD_TMO_UNITS;

const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('② 단끝 해제(v26.5) — 자동 판정: 단끝이 거리상 이기는 스펙이면 auto 가 singleEnd 를 고른다',()=>{
  assert.strictEqual(C.MAGIC_SINGLE_END_SUSPENDED,false,'중단 플래그가 다시 켜졌다(사용자 해제 지시 회귀)');
  // v26.5: 단끝 상위 슬롯도 2 로 열린다(항법 상한만 남음).
  assert.strictEqual(C.upperSlotLimit('singleEnd',{}),2,'단끝 상위 2 슬롯이 닫혀 있다');
  assert.strictEqual(C.upperSlotLimit('singleEnd',{navFamily:'conqueror',navPerk:''}),1,'패왕의길 상한이 풀렸다');
  const st=C.normalizeState(units,{counts:{},currentAbilities:{}},{manualCounts:{}});
  // 단끝 요구는 거의 다 닫히고 dual(상위 2)만 먼 스펙 — auto 는 이제
  // 두 경로를 실제 비교해 singleEnd 를 고른다.
  const spec=Object.assign({},C.currentSpec(st,'magic',{}),{main:1,stun:1.6,slow:130,boss:1,frenzy:1,bossFrenzy:1,toki:0,single:2,end:1,singleEnd:3,singleEndExpected:3,singleEndStable:3,singleEndMax:3});
  const auto=C.deficits(spec,'magic',{gorosei:'none',magicRoute:'auto'});
  assert.strictEqual(auto.profile.key,'singleEnd',`auto 가 ${auto.profile.key}를 골랐다(단끝 우세 스펙)`);
  assert(!String(auto.profile.note||'').includes('단끝 경로 일시 중단'),'해제됐는데 중단 사유가 남아 있다');
});

test('② 명시 singleEnd 와 패왕의길 강제는 해제 후에도 그대로 존중된다',()=>{
  const st=C.normalizeState(units,{counts:{},currentAbilities:{}},{manualCounts:{}});
  const spec=C.currentSpec(st,'magic',{});
  const explicit=C.deficits(spec,'magic',{gorosei:'none',magicRoute:'singleEnd'});
  assert.strictEqual(explicit.profile.key,'singleEnd','명시 선택이 무시됐다');
  const conqueror=C.deficits(spec,'magic',{gorosei:'none',magicRoute:'auto',navFamily:'conqueror',navPerk:''});
  assert.strictEqual(conqueror.profile.key,'singleEnd','패왕의길에서 dual 을 골랐다(불가능 경로)');
});

test('② 단끝 해제(v26.5) — 엔진 차선: 자동 모드 lanes 에 singleEnd 가 돌아온다',()=>{
  const model=M.build({catalog:units,snapshot:{source:'t',counts:{},currentAbilities:{},wispCountFound:true,wispCount:0},settings:{mode:'magic',magicRoute:'auto',currentRound:20,manualCounts:{}},locks:[]});
  const lanes=E._test.routeOptions(model).map(route=>route.key);
  assert(lanes.includes('singleEnd'),`singleEnd 차선이 죽어 있다: ${lanes.join(',')}`);
  assert(lanes.includes('dual'));
});

test('② 단끝 해제(v26.5) — 플래너: magic auto 가 두 경로를 실제 비교한다',()=>{
  const plan=P.planFinalSquad({units,counts:{V80H:1},wisp:20,settings:{mode:'magic',magicRoute:'auto',upperPreviewId:'V80H',targetSquadCount:9},locks:[]});
  // vm 렐름 배열은 호스트 deepStrictEqual 과 프로토타입이 달라 스프레드로
  // 호스트 배열로 옮겨 비교한다.
  const routes=[...(plan.routeComparison&&plan.routeComparison.routes||[])].map(row=>row.route).sort();
  assert.deepStrictEqual(routes,['dual','singleEnd'],`플래너 auto 비교 경로: ${routes.join(',')}`);
  assert(['dual','singleEnd'].includes(plan.magicRoute),'auto 선택이 비교 경로 밖이다');
  assert(!String(plan.routeComparison&&plan.routeComparison.reason||'').includes('단끝 경로 일시 중단'),'해제됐는데 중단 사유가 남아 있다');
  const explicit=P.planFinalSquad({units,counts:{V80H:1},wisp:20,settings:{mode:'magic',magicRoute:'singleEnd',upperPreviewId:'V80H',targetSquadCount:9},locks:[]});
  assert.strictEqual(explicit.magicRoute,'singleEnd','플래너가 명시 singleEnd 를 무시했다');
});

test('① 관성 — 0817 패배 로그 재생: 28~52라 타깃 교체가 절반 이하로 준다 (12→≤6)',()=>{
  const R=require('./lib/reconcile_replay.js');
  const out=R.replayDisplayed('data/ORD_2310_20260817_094134_r51_65_failed.ordlog.json',{fromRound:28,toRound:52,keepDecisions:true});
  let switches=0,prev='',incumbent=0;
  for(const row of out.rounds){
    if(row.state!=='ACT_NOW'||!row.actionName)continue;
    if(prev&&row.actionName!==prev)switches++;
    prev=row.actionName;
    if(row.decision&&row.decision.evidence&&row.decision.evidence.stickyIncumbent)incumbent++;
  }
  assert(switches<=6,`타깃 교체 ${switches}회 — 관성이 풀렸다(수정 전 12회)`);
  assert(incumbent>=1,'승격층 현직 유지(stickyIncumbent)가 한 번도 발화하지 않았다');
});

test('① 관성 — 소스 계약: 탐색층 현직 우위 + 승격층 유지 + 해제 조건',()=>{
  const src=read('ord_v15_engine.js');
  assert(src.includes("held.stickyHold='incumbent'"),'탐색층 현직 우위 부재');
  assert(src.includes('stickyIncumbent'),'승격층 현직 유지 부재');
  // 해제 조건: 재견적 불능(deficitRepairSafe 내 신선 견적)·veto·제작 완료.
  assert(src.includes("!vetoedIds(model).has(stickyId)"),'veto 해제 조건 부재');
  assert(src.includes('num(model.effective.counts[stickyId])<=0'),'제작 완료 해제 조건 부재');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_3_0_INERTIA_SINGLE_END ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
