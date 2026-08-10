'use strict';
// v22.6.0 계약 — 게임 결과 입력창 대형화 (사용자 요청 · 첫 클리어 판).
//
// 사용자: "게임 결과 적는 칸 글씨가 너무 작고 쉽게 적을 수 있게 바꿔줘
// 게임은 클리어 했어" — ORD_2310_20260810_034734_r65_cleared (v22.5.0 ·
// 나스쥬로 물딜 (A)카타쿠리 · 21라 조기 확정 · 최종 준비도 98).
//
// ① 셀렉트 2개(따랐나요/실패 상황) → 큰 세그먼트 버튼
// ② 폰트 대형화(v226 스코프) — 7~10px 시대 종료
// ③ 세그먼트 핸들러는 RUN_RESULT_DEFAULTS 필드만 받는다

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const appSrc=read('ord_app.js'),css=read('ord_ui_v20.css');
const tests=[];
function test(name,fn){tests.push([name,fn]);}

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const App=context.ORDApp.App;

test('① 셀렉트가 세그먼트 버튼으로 바뀌었다',()=>{
  assert(!appSrc.includes('select data-run-field="followedProgram"'),'따랐나요 셀렉트가 남아 있다');
  assert(!appSrc.includes('select data-run-field="failureReason"'),'실패 상황 셀렉트가 남아 있다');
  const obj=Object.create(App.prototype);
  obj._runResultOpen=true;
  obj._runResultDraft={kind:'r51_65_failed',failureReason:'line',followedProgram:'followed',round:'60',bossHpPercent:'',attackUpgrade:'',slowUpgrade:'',hpRegenUpgrade:'',mpRegenUpgrade:'',helperUsed:false,note:''};
  obj.state={pendingTransaction:null};
  obj.renderVerdictReport=()=>'';
  obj.verdictReportForDisplay=()=>null;
  const html=obj.renderRunResultModal({ready:true,label:'정상',ageSec:3});
  assert(html.includes('run-result-modal v226'),'v226 스코프 클래스가 없다');
  assert((html.match(/v226-seg/g)||[]).length>=2,'세그먼트 행이 2개 미만');
  assert(html.includes('data-act="run-result-field"'),'세그먼트 액션 배선 없음');
  assert(/data-field="failureReason" data-value="line">라인사<\/button>/.test(html.replace(/class="[^"]*" /,''))||html.includes('data-value="line"'),'실패 상황 세그먼트 없음');
  assert(html.includes('class="on"')||/class="[^"]*on[^"]*" data-act="run-result-field"/.test(html),'현재 선택 강조가 없다');
  // 클리어 종류에서는 실패 상황 세그먼트가 사라진다.
  obj._runResultDraft.kind='r65_cleared';
  const cleared=obj.renderRunResultModal({ready:true,label:'정상',ageSec:3});
  assert(!cleared.includes('data-field="failureReason"'),'클리어인데 실패 상황이 뜬다');
});

test('② 대형화 CSS — v226 스코프',()=>{
  for(const sel of ['.run-result-modal.v226>header h2{font-size:24px','.run-result-modal.v226 .result-kinds b{font-size:16px','.v226-seg button{','.run-result-modal.v226 .result-form input,'])assert(css.includes(sel),`CSS 누락: ${sel}`);
});

test('③ 세그먼트 핸들러는 알려진 결과 필드만 받는다',()=>{
  assert(appSrc.includes("a==='run-result-field'"),'핸들러 없음');
  assert(appSrc.includes('Object.prototype.hasOwnProperty.call(RUN_RESULT_DEFAULTS,field)'),'필드 화이트리스트가 없다 — 임의 키 주입 가능');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V22_6_0_RESULT_MODAL ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
