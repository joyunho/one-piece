'use strict';
// v22.2.0 계약 — 초월 쿠마 몰수 배선 + 넘어가기 (0809b r60 실패 로그).
//
// 사용자: "스토리 10 보상에서 초월 쿠마를 선택 안했는데 중간에 갑자기
// 초월 유닛을 추천해서 내 생각대로 조합했어. 아닌 것 같은건 넘어가기
// 뭐 이런식으로 버튼을 만들어야 할 것 같아."
//
// 포렌식: 엔진이 초월 쿠마를 무조건 유령 주입(superKumaOwned 기본 true,
// story10Reward 미배선)했다 — 레일리는 골라야만 크레딧되면서 쿠마는
// 공짜로 크레딧되는 비대칭.  r20-26 방향 후보에 "레일리 수령 전제(=쿠마
// 포기)" 초월 후보가 노출됐고, 상자(chest) 선택 후에도 유령 쿠마는
// 살아 있었다.
//
// ① 스토리 10 몰수 배선: rayleigh/chest 선택 → 유령 쿠마 주입 중단
// ② 설정 연동: story10Reward 선택이 초월 가능 토글을 함께 움직인다
// ③ 넘어가기: 거부한 유닛은 마일스톤·탐색 후보에서 빠지고 복원 가능

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
const C=context.ORDCore,engine=context.ORDV15Engine,App=context.ORDApp.App;
const cat=context.ORD_TMO_UNITS;
const mk=(counts,wisp,extra)=>({catalog:cat,snapshot:{source:'v222',counts:Object.assign({[C.WISP_ID]:wisp},counts),wispCountFound:true,wispCount:wisp,currentAbilities:{}},settings:Object.assign({currentRound:14,mode:'physical',magicRoute:'auto',manualCounts:{}},extra&&extra.settings||{}),locks:extra&&extra.locks||[]});

test('① 스토리 10 몰수: rayleigh/chest 선택 시 유령 초월 쿠마 주입이 꺼진다 (코어+엔진 모델)',()=>{
  const forCore=choice=>C.num(C.normalizeState(cat,{counts:{},currentAbilities:{}},{manualCounts:{},story10Reward:choice}).counts[C.SUPER_KUMA_ID]);
  assert(forCore('')>=1,'미정 상태의 게임 규칙 가정(쿠마 1)이 사라짐');
  assert(forCore('kuma')>=1,'쿠마를 골랐는데 주입이 꺼짐');
  assert.strictEqual(forCore('rayleigh'),0,'레일리 선택 후에도 유령 쿠마가 산다');
  assert.strictEqual(forCore('chest'),0,'상자 선택(0809b 실황) 후에도 유령 쿠마가 산다');
  const decision=engine.decide(mk({},12,{settings:{story10Reward:'chest'}}));
  assert.strictEqual(C.num(decision.model.effective.counts[C.SUPER_KUMA_ID]),0,'엔진 모델에 유령 쿠마가 남아 있다');
  const open=engine.decide(mk({},12));
  assert(C.num(open.model.effective.counts[C.SUPER_KUMA_ID])>=1,'미정 상태 엔진 가정이 사라짐');
});

test('① 차단 사유가 견적·플래너에도 배선됐다 (소스 검증)',()=>{
  const ledger=read('ord_v15_ledger.js'),core=read('ord_core.js'),planner=read('ord_squad_planner.js'),model=read('ord_v15_model.js');
  for(const [src,name] of [[ledger,'ledger'],[core,'core']])assert(src.includes('스토리 10 보상에서 초월 쿠마 포기'),`${name} 차단 사유 없음`);
  assert(planner.includes("['rayleigh','chest'].includes(String(settings.story10Reward||''))"),'플래너 필터 없음');
  assert(model.includes("story10-forfeit"),'모델 주입 근거 표기 없음');
});

test('② story10Reward 선택이 초월 가능 토글을 함께 움직인다',()=>{
  const obj=Object.create(App.prototype);
  obj.state={superKumaOwned:true,story10Reward:'',pendingTransaction:null};
  obj.persist=()=>{};obj.render=()=>{};obj.toast=()=>{};obj.recordAuditAction=()=>{};obj.releaseDirectionHold=()=>{};
  obj.setOpt('story10Reward','chest');
  assert.strictEqual(obj.state.superKumaOwned,false,'상자 선택이 초월 가능을 끄지 않음');
  obj.setOpt('story10Reward','kuma');
  assert.strictEqual(obj.state.superKumaOwned,true,'쿠마 선택이 초월 가능을 되살리지 않음');
});

test('③ 넘어가기: 거부한 유닛은 마일스톤 1순위에서 빠진다',()=>{
  const HAND={G20h:1,J20h:1,'720h':1};
  const before=engine.decide(mk(HAND,12));
  const pickBefore=before.action||before.blockedAction;
  assert.strictEqual(pickBefore.id,'H30h','재현 전제(샬롯 크래커 1순위)가 흔들림');
  const after=engine.decide(mk(HAND,12,{settings:{_vetoIds:['H30h']}}));
  const pickAfter=after.action||after.blockedAction;
  assert(pickAfter&&pickAfter.id!=='H30h',`거부한 유닛이 여전히 1순위: ${pickAfter&&pickAfter.name}`);
});

test('③ 카드 배선: 넘어가기 버튼 + 복원 스트립 + 확정 상위 카드에는 숨김',()=>{
  const stub=()=>{const obj=Object.create(App.prototype);
    obj.state={mode:'physical',locks:[],pendingTransaction:null,secondUpperId:'',labResearch:{},rerollsUsed:0,vetoIds:[]};
    obj.actualRound=()=>30;obj.upperLock=()=>null;obj.observedDeficits=()=>({clearRows:[]});
    obj.commandInfo=()=>({hasVerified:false});obj.v157SecondUpperCallout=()=>'';obj.v157LongshotHint=()=>'';
    obj.v151ActionFacts=()=>'';obj.v153Icon=()=>'<i></i>';obj.v151StoryTag=()=>'';obj.v216BargesTag=()=>'';return obj;};
  const state={db:null,wisp:5};
  const decision=id=>({state:'ACT_NOW',label:'제작',reason:'r',assessment:{},action:{id,name:'후보',wispCost:0,wispAfter:5,unit:null,quote:{wisp:{cost:0},solve:{rareUse:{},direct:[],lowestMissing:{}}},deltas:[]}});
  const obj=stub();
  const html=obj.renderV151NextAction(state,{v15Decision:decision('190H'),postLegendDecision:{awaiting:false}},{ready:true});
  assert(html.includes('veto-action')&&html.includes('넘어가기'),'넘어가기 버튼이 없다');
  obj.state.vetoIds=['830h'];
  const withStrip=obj.renderV151NextAction(state,{v15Decision:decision('190H'),postLegendDecision:{awaiting:false}},{ready:true});
  assert(withStrip.includes('v222-vetoed')&&withStrip.includes('unveto-action'),'복원 스트립이 없다');
  const committed=Object.assign(decision('LB0H'),{evidence:{upperFirst:true}});
  const upperHtml=obj.renderV151NextAction(state,{v15Decision:committed,postLegendDecision:{awaiting:false}},{ready:true});
  assert(!upperHtml.includes('data-act="veto-action"'),'확정 상위 카드에 넘어가기 버튼이 뜬다');
  for(const marker of ["a==='veto-action'","a==='unveto-action'",'vetoIds:[]','_vetoIds:(this.state.vetoIds||[])'])assert(appSrc.includes(marker),`앱 배선 누락: ${marker}`);
  for(const sel of ['.v222-veto{','.v222-vetoed{'])assert(css.includes(sel),`CSS 누락: ${sel}`);
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V22_2_0_TRANSCEND_VETO ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
