'use strict';

// v23.10.0 계약 — 0821 패배 포렌식 (data/ORD_2310_20260821_181712_r51_65_failed).
//
// 사용자 패배 메모 원문: "2상위 제대로 추천 못함".  실측 복원:
//  · 메인 상위 빅맘을 35라에 제작.  이후 2상위 목표가 화면 어디에도
//    서지 않았다 — 확정 콜아웃(v15.7)은 secondUpperId 가 이미 있을 때만
//    뜨고, 후보 목록은 참고 서랍 속(간단 보기에선 숨김)이었다.
//  · 38~50라 다음 제작 타깃이 보조 전설 10종 사이를 표류(루치→아오키지→
//    검은수염→브룩→드래곤→모리아→바르톨로메오→라분→제파→베이비5).
//  · 선위 24(38라) → 6(51라) — 보조 전설로 소진.  51라를 상위 1기·
//    최종 5기로 진입, 62라 line 패배.
//
// 계약: 메인 상위 1기 보유 + 2상위 미확정 + 항법이 2상위 허용 + 50라
// 이하이면, 지금 할 일에 2상위 확정 카드(후보 3·확정 버튼)가 선다.
// 40라부터 긴급 톤.  HUD 중계 화이트리스트에도 confirm-second-upper.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,App=context.ORDApp.App,units=context.ORD_TMO_UNITS;
const BIGMAM='Q40h';

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);
function appStub(overrides){
  const obj=Object.create(App.prototype);
  obj.state=Object.assign({mode:'magic',magicRoute:'auto',postLegendRoute:'',secondUpperId:'',upperPreviewId:'',navFamily:'none',navPerk:'',transcendUsed:0,seraphUsed:0,changedUsed:0,rerollsUsed:0,currentRound:41,vetoIds:[],locks:[],recentMainUppers:[]},overrides||{});
  obj.actualRound=()=>C.num(obj.state.currentRound)||41;
  obj.v197PrescribedSecondIds=()=>[];
  obj.upperLock=()=>null;
  return obj;
}
const stateOf=counts=>C.normalizeState(units,{counts:counts||{},currentAbilities:{}},{manualCounts:{}});
const planOf=()=>({v15Decision:{state:'HOLD',routeCandidates:[]},postLegendDecision:{awaiting:false},upper:null,mode:'magic'});
const HEALTH={ready:true,key:'ok',label:'연결'};

test('① 빅맘 보유 + 2상위 미확정 → 지금 할 일에 2상위 확정 카드 (0821 재현 조건)',()=>{
  const app=appStub(),state=stateOf({[BIGMAM]:1});
  assert.strictEqual(C.num(C.progressionCounts(state).upper),1,'전제: 빅맘이 상위 1기로 집계돼야');
  const html=app.renderV151NextAction(state,planOf(),HEALTH);
  assert(html.includes('v2310-second-pick'),'2상위 확정 카드가 안 선다 — 0821 침묵 재현');
  assert(html.includes('data-act="confirm-second-upper"'),'확정 버튼 부재');
  assert(html.includes('urgent'),'41라면 긴급 톤이어야(마감 40라+)');
});

test('② 이미 확정·항법 제한·50라 초과면 카드 없음',()=>{
  const state=stateOf({[BIGMAM]:1});
  assert(!appStub({secondUpperId:'C50h'}).renderV151NextAction(state,planOf(),HEALTH).includes('v2310-second-pick'),'확정 후에도 카드가 남는다');
  assert(!appStub({navFamily:'conqueror',navPerk:'royal'}).renderV151NextAction(state,planOf(),HEALTH).includes('v2310-second-pick'),'패왕의길(상위 1기)인데 카드가 뜬다');
  assert(!appStub({currentRound:55}).renderV151NextAction(state,planOf(),HEALTH).includes('v2310-second-pick'),'51라 이후에도 카드가 뜬다(무의미 시점)');
});

test('③ HUD 중계 화이트리스트에 confirm-second-upper',()=>{
  const boot=read('ord_boot_desktop.js');
  // v26.0(보조 모드) 재핀: 확정 카드가 HUD 에 안 뜨므로 중계도 은퇴 —
  // 2상위 확정 행위 자체는 분석 화면(v153-second)에 남아 있음을 지킨다.
  assert(!boot.includes("'confirm-second-upper': 1"),'은퇴한 HUD 확정 중계가 되살아남');
  const appSrc2=read('ord_app.js');
  assert(appSrc2.includes('data-act="confirm-second-upper"'),'2상위 확정 버튼이 프로그램에서 사라짐(분석 화면 계약)');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_10_0_SECOND_UPPER_PROMPT ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);