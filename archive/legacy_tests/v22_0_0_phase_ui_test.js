'use strict';
// v22.0.0 계약 — 국면 구동형 UI (사용자 승인 목업 · 전략_구상.md 기반).
//
// 사용자: "UI 전체적인 개편이 필요해 내가 준 명세서에 맞게 필요한 정보만
// 간추려서 나한테 보여줘" → 목업 승인.
//
// ① 국면 판정: 명세서 여섯 구간 + 첫 희귀/첫 전설 마일스톤이 라운드보다 우선
// ② 다음 제작 레일은 마감 국면(④⑤)에만 열린다
// ③ 국면 패널: ③ 희귀 사용 계획 공유, ⑤ 스펙 게이지, 전 국면 전체 표 폴드
// ④ 참고 탭은 기본 접힘 서랍 — 탭 클릭으로 열리고 접기로 닫힌다
// ⑤ 상단 스트립이 국면·최근접 마감을 든다 — 카드 밑 중복 칩은 제거
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
const stub=round=>{
  const obj=Object.create(App.prototype);
  obj.state={mode:'magic',magicRoute:'auto',virtualSpecialId:'',locks:[],currentRound:round,rerollsUsed:0};
  obj.upperLock=()=>null;
  obj.observedDeficits=()=>({clearRows:[]});
  obj.renderV151NextAction=()=>'<i data-test="next"></i>';
  obj.renderV153Status=()=>'<section data-region="game-status"></section>';
  obj.renderV153Preview=()=>'<i data-test="candidate"></i>';
  obj.renderV153Spec=()=>'<i data-test="spec"></i>';
  obj.renderV153CraftableLegends=()=>'<i></i>';
  obj.renderV153UnusedRare=()=>'<i></i>';
  obj.renderV153UpperParty=()=>'<i></i>';
  return obj;
};
const plan=(extra)=>Object.assign({v15Decision:{state:'ACT_NOW'},postLegendDecision:{awaiting:false}},extra||{});

test('① 국면 판정 — 명세서 여섯 구간 + 마일스톤 우선',()=>{
  const at=(round,milestone)=>{const obj=stub(round);return obj.v22Phase(plan(milestone?{v15Decision:{state:'ACT_NOW',evidence:{completionMilestone:milestone}}}:null)).key;};
  assert.strictEqual(at(5),'p1');
  assert.strictEqual(at(15),'p2');
  assert.strictEqual(at(24),'p3');
  assert.strictEqual(at(35),'p4');
  assert.strictEqual(at(45),'p5');
  assert.strictEqual(at(55),'p6');
  // 첫 희귀가 늦으면(12라에도 firstRare) 국면 ①에 머문다 — 명세 ①이 최우선.
  assert.strictEqual(at(12,'firstRare'),'p1');
  // 첫 전설이 늦으면(24라에도 firstFinal) 국면 ②에 머문다.
  assert.strictEqual(at(24,'firstFinal'),'p2');
  // 마일스톤 지연이 있어도 30라부터는 구간 국면으로 넘어간다(마감 우선).
  assert.strictEqual(at(31,'firstFinal'),'p4');
});

test('② 다음 제작 레일 — v26.0 보조 모드에서 완전 은퇴(어느 국면에도 없음)',()=>{
  // v22.0 원계약: 레일은 마감 국면(④⑤)에만 열린다.  v26.0(사용자 0826
  // "프로그램은 보조 용도로만"): 미리 고정하는 제작 큐 자체가 처방이라
  // 은퇴 — 어느 국면에도 레일·휴면 안내가 없어야 한다.
  for(const round of [24,45]){
    const html=stub(round).renderCoach({},plan(),{},{},{ready:true,key:'ok'});
    assert(!html.includes('data-test="candidate"'),`${round}라에 은퇴한 후보 레일이 열려 있다`);
    assert(!html.includes('v22-rail-rest'),`${round}라에 은퇴한 레일 휴면 안내가 있다`);
  }
});

test('③ 국면 패널 — ⑤ 게이지·전 국면 전체 표 폴드·③ 계획 공유',()=>{
  const obj=stub(43);
  obj.observedDeficits=()=>({clearRows:[{key:'slow',label:'이감 117%',required:true,current:86.4,target:117,gap:30.6},{key:'bossFrenzy',label:'광보잡',required:true,current:1,target:1,gap:0}]});
  const panel=obj.renderV22PhasePanel({},plan());
  assert(panel.includes('v22-gauge'),'게이지가 없다');
  assert(panel.includes('miss'),'열린 결손 표시가 없다');
  assert(panel.includes('v22-spec-fold')&&panel.includes('data-test="spec"'),'전체 스펙 표 폴드가 없다');
  // ③ 국면: 상위 확정 시 희귀 사용 계획이 국면 패널에 뜬다(v215 공유).
  const p3=stub(24);
  p3.upperLock=()=>({id:'V80H'});
  const rows=[{id:'K00h',name:'바질 호킨스',initial:1,use:1,hold:0,reroll:0,reason:'나미 재료'}];
  const p3html=p3.renderV22PhasePanel({},plan({v15Decision:{state:'ACT_NOW',rare:{rows}}}));
  assert(p3html.includes('v215-rare-plan')&&p3html.includes('바질 호킨스'),'③ 국면 계획 공유가 없다');
  // 상위 전에는 계획 대신 안내문.
  const p3idle=stub(24).renderV22PhasePanel({},plan());
  assert(p3idle.includes('여기 뜹니다'),'③ 국면 대기 안내가 없다');
});

test('④ 참고 패널은 분석 화면으로 — 플레이 화면에서 서랍 은퇴(v24.0 재핀)',()=>{
  // v22.0 의 "기본 접힘 서랍"은 v24.0 플레이/분석 2화면 분리로 대체됐다.
  // 원 취지(판 중 화면에 참고 정보를 상시 노출하지 않는다)는 더 강하게
  // 유지된다 — 아예 다른 화면이다.
  const play=stub(45).renderCoach({},plan(),{},{},{ready:true,key:'ok'});
  for(const gone of ['v211-refer','v22-drawer-close','data-region="reference"','data-region="upper-party"','data-region="clear-gaps"'])assert(!play.includes(gone),`플레이 화면에 남아 있다: ${gone}`);
  const aux=stub(45);aux.renderV22PhasePanel=()=>'<i data-test="phase"></i>';
  const analysis=aux.renderAuxiliaryPage('analysis',{},plan(),{ready:true,key:'ok'});
  for(const region of ['clear-gaps','upper-party','craftable-legends','unused-rare'])assert(analysis.includes(`data-region="${region}"`),`분석 화면 ${region} 없음`);
  assert(!appSrc.includes("a==='v22-drawer-close'")&&!appSrc.includes('_v22DrawerOpen'),'은퇴한 서랍 배선이 남아 있다');
  assert(!css.includes('.v211-refer.v22-closed'),'은퇴한 서랍 CSS가 남아 있다');
});

test('⑤ 상단 스트립이 국면·마감을 들고, 카드 밑 중복 칩은 제거됐다',()=>{
  assert(appSrc.includes('class="v22-phase"'),'국면 칩 없음');
  assert(appSrc.includes('class="v22-due'),'마감 칩 없음');
  // 카드 밑 칩 5개 중 리롤만 남는다.  '다음 보스'는 보스 상세 카드(HP·재생
  // 표)에 별도로 살아 있으므로 ActionFacts 고유 문자열로만 판정한다.
  // (위습 칩 제거는 그 칩 고유 문구 '예산 가드 작동'으로 판정 — '선택
  // 위습' 표기는 v152 히어로 스트립·진단 페이지에 정당하게 남는다.)
  for(const gone of ['<small>다음 마감</small>','v151-phase-chip','예산 가드 작동'])assert(!appSrc.includes(gone),`중복 칩이 남아 있다: ${gone}`);
  assert(appSrc.includes('리롤 잔여'),'리롤 잔여 칩은 남아야 한다(카드 고유 정보)');
  for(const sel of ['.v22-phase{','.v22-due{','.v22-gauge label{','.v22-goal{','.v22-rail-rest{'])assert(css.includes(sel),`CSS 누락: ${sel}`);
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V22_0_0_PHASE_UI ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
