'use strict';
// v21.6.0 계약 — 0808 실패 로그(2판 연속 43라 사망) 포렌식 + 구상 ④.
//
// 포렌식 요지: 두 판 모두 코치 판단은 맞았고 실행이 늦었다.
//  · 1판: (S)나미 13라운드 방치(29→42라 제작) · 위습 19개 미사용 사망.
//  · 2판: 레이쥬(이감35, 비용 6/보유 14) 방치 사망.
//  · 1판 43~65라: 사망 후 관전 구간에 22라운드 동안 추천이 헛돌았다.
// 원인 코드: v19.9 스킵 추적이 상태가 잠깐 튀기만 해도 초기화돼
// 방치 라운드가 누적되지 못했다.
//
// ① 목격 원장: 다른 카드가 끼어들어도 방치 카운트가 유지된다
// ② 같은 유닛이 비실행 상태로 목격되면 원장에서 내려간다(과장 금지)
// ③ 격상: 방치 5라운드+ 또는 38라 이후 2라운드+ → 카드 전체 v216-urgent
// ④ 사재기 경고: 40라+ 필수 결손 open + 위습이 비용 이상이면 명시
// ⑤ 관전 동결: 40라+ 3라운드 연속 무변화 → 결과 기록 유도
// ⑥ 바제스 배지(구상 ④): abilities['바제스'] 유닛, 26~40라 구간만
// ⑦ 설치 스크립트가 바탕화면 "ORD 코치 업데이트" 바로가기를 만든다

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
const App=context.ORDApp.App,C=context.ORDCore;
const stubApp=round=>{
  const obj=Object.create(App.prototype);
  obj.state={mode:'physical',locks:[],pendingTransaction:null,secondUpperId:'',labResearch:{}};
  obj.actualRound=()=>round;
  obj.upperLock=()=>null;
  obj.observedDeficits=()=>({clearRows:[]});
  obj.commandInfo=()=>({hasVerified:false});
  obj.v157SecondUpperCallout=()=>'';
  obj.v157LongshotHint=()=>'';
  obj.v151ActionFacts=()=>'';
  obj.v153Icon=()=>'<i></i>';
  obj.v151StoryTag=()=>'';
  return obj;
};
const mkState=()=>C.normalizeState(context.ORD_TMO_UNITS,{counts:{},units:[]},{});
const actDecision=(id,extra)=>Object.assign({state:'ACT_NOW',label:'제작',reason:'마감',assessment:{},action:{id,name:'후보',wispCost:0,wispAfter:5,unit:null,quote:{wisp:{cost:0},solve:{rareUse:{},direct:[],lowestMissing:{}}},deltas:[]}},extra||{});
const renderAt=(obj,round,decision,state)=>{obj.actualRound=()=>round;return obj.renderV151NextAction(state||mkState(),{v15Decision:decision,postLegendDecision:{awaiting:false}},{ready:true});};

test('① 다른 카드가 끼어들어도 방치 카운트가 유지된다 (0808 사인 — 옛 추적은 여기서 리셋)',()=>{
  const obj=stubApp(19),state=mkState();
  const first=renderAt(obj,19,actDecision('190H'),state);
  assert(!first.includes('v159-skip-warn'),'첫 목격부터 경고가 뜸');
  // 라운드 20: 전혀 다른 카드(보류)가 잠깐 끼어든다 — 190H 에 대한
  // 부정 증거가 아니므로 원장은 유지되어야 한다.
  renderAt(obj,20,{state:'HOLD',label:'보류',reason:'재료 보호',assessment:{},action:null},state);
  const held=renderAt(obj,21,actDecision('190H'),state);
  assert(held.includes('v159-skip-warn'),'복귀 라운드에 경고가 없다');
  assert(held.includes('3라운드째'),`방치 라운드 누적이 끊겼다: ${held.match(/\d+라운드째/)||'없음'}`);
});

test('② 같은 유닛이 비실행 상태로 목격되면 원장에서 내려간다 — 방치 과장 금지',()=>{
  const obj=stubApp(19),state=mkState();
  renderAt(obj,19,actDecision('190H'),state);
  // 라운드 20: 190H 자체가 보류로 목격됨(재료 소진 등) — 리셋되어야 한다.
  renderAt(obj,20,{state:'HOLD',label:'보류',reason:'재료 보호',assessment:{},action:null,blockedAction:{id:'190H',name:'후보',wispCost:9,unit:null,deltas:[]}},state);
  const back=renderAt(obj,21,actDecision('190H'),state);
  assert(!back.includes('v159-skip-warn'),'리셋 후 첫 재목격인데 경고가 뜸');
});

test('③ 격상: 방치 5라운드+ 또는 38라 이후 → 카드 전체 v216-urgent + 경고 굵힘',()=>{
  const obj=stubApp(30),state=mkState();
  renderAt(obj,30,actDecision('190H'),state);
  const mid=renderAt(obj,32,actDecision('190H'),state);
  assert(mid.includes('v159-skip-warn')&&!mid.includes('v216-urgent'),'이른 구간(3라운드 방치)이 이미 격상됨');
  const crit=renderAt(obj,34,actDecision('190H'),state);
  assert(crit.includes('v216-urgent')&&crit.includes('v216-critical'),'5라운드 방치가 격상되지 않음');
  assert(crit.includes('사인이었습니다'),'격상 경고에 0808 근거 문구가 없다');
  // 38라 이후는 2라운드 방치부터 즉시 격상.
  const late=stubApp(38);
  renderAt(late,38,actDecision('Z90h'),state);
  const lateCrit=renderAt(late,39,actDecision('Z90h'),state);
  assert(lateCrit.includes('v216-urgent'),'38라+ 2라운드 방치가 격상되지 않음');
});

test('④ 사재기 경고: 40라+ 필수 결손 open + 위습 ≥ 비용이면 보유/비용을 명시 (2판: 14 보유·비용 6 방치 사망)',()=>{
  const obj=stubApp(41);
  const state=Object.assign(mkState(),{wisp:14});
  const decision=actDecision('330h',{assessment:{requirements:[{key:'slow',label:'이감 117%',required:true,gap:30.6}]}});
  decision.action.wispCost=6;
  const html=renderAt(obj,41,decision,state);
  assert(html.includes('v216-hoard-warn'),'사재기 경고가 없다');
  assert(html.includes('<b>14</b>')&&html.includes('<b>6</b>'),'보유 위습·마감 비용 명시가 없다');
  // 39라에서는 뜨지 않는다(40라+ 전용).
  const early=stubApp(39);
  const earlyHtml=renderAt(early,39,decision,state);
  assert(!earlyHtml.includes('v216-hoard-warn'),'40라 전에 사재기 경고가 뜸');
});

test('⑤ 관전 동결: 40라+ 패·위습·결손 3라운드 연속 무변화 → 결과 기록 유도 (1판 43~65라 22라운드 헛돈 추천)',()=>{
  const obj=stubApp(43);
  const state=Object.assign(mkState(),{wisp:19});
  const frozen={state:'HOLD',label:'보류',reason:'변화 없음',assessment:{requirements:[{key:'slow',label:'이감 102%',required:true,gap:59.5}]},action:null};
  let html='';
  for(const round of [43,44,45,46,47])html=renderAt(obj,round,frozen,state);
  assert(html.includes('v216-freeze-note'),'동결 감지가 없다');
  assert(html.includes('run-result-open'),'결과 기록 유도 버튼이 없다');
  // 위습이 변하면(살아 있는 판) 감지가 풀린다.
  const live=stubApp(43);
  for(const round of [43,44,45,46,47])html=renderAt(live,round,frozen,Object.assign(mkState(),{wisp:19+round}));
  assert(!html.includes('v216-freeze-note'),'상태가 변하는데 동결로 오인함');
});

test('⑥ 바제스 배지(구상 ④): abilities[바제스] 유닛에 26~40라 구간만 표시 · 카탈로그 데이터 실재',()=>{
  const units=context.ORD_TMO_UNITS;
  const flagged=units.filter(u=>u.abilities&&u.abilities['바제스']);
  assert(flagged.length>=60,`바제스 표식 유닛이 너무 적다: ${flagged.length}`);
  for(const name of ['레일리','마르코','흰수염']){
    assert(flagged.some(u=>String(u.name||'').includes(name)),`${name}에 바제스 표식이 없다`);
  }
  const unit=flagged.find(u=>String(u.name||'').includes('마르코'));
  const obj=stubApp(32);
  assert(/v216-barges/.test(obj.v216BargesTag(unit)),'미션 구간(32라)에 배지가 없다');
  obj.actualRound=()=>20;
  assert.strictEqual(obj.v216BargesTag(unit),'','미션 구간 밖(20라)에 배지가 뜸');
  obj.actualRound=()=>41;
  assert.strictEqual(obj.v216BargesTag(unit),'','미션 종료(41라) 뒤에도 배지가 뜸');
  const plain=units.find(u=>u&&(!u.abilities||!u.abilities['바제스'])&&u.name);
  obj.actualRound=()=>32;
  assert.strictEqual(obj.v216BargesTag(plain),'','표식 없는 유닛에 배지가 뜸');
  // 배선: 카드 제목·다음 제작 목록·상세 모달 3곳.
  const hooks=appSrc.split('this.v216BargesTag(').length-1;
  assert(hooks>=3,`배지 배선이 부족하다(${hooks}곳 — 카드·다음 제작·상세 모달이 기준)`);
});

test('⑦ 소스·스타일·설치 스크립트 배선',()=>{
  assert(appSrc.includes('_v216FeasibleSince'),'목격 원장 없음');
  assert(!appSrc.includes('_v199ActionTrack'),'옛 리셋형 추적이 남아 있다');
  assert(css.includes('.v151-action.v216-urgent'),'격상 카드 스타일 없음');
  assert(css.includes('.v216-hoard-warn')&&css.includes('.v216-freeze-note')&&css.includes('.v216-barges'),'v216 스타일 누락');
  const ps1=fs.readFileSync(path.join(__dirname,'..','tools','desktop_install.ps1'),'utf8');
  assert(ps1.includes('ORD 코치 업데이트.lnk'),'업데이트 바로가기 생성이 없다');
  assert(ps1.includes("Join-Path $repo '업데이트.bat'"),'업데이트 바로가기 대상이 저장소 업데이트.bat 이 아니다');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V21_6_0_URGENCY_BARGES ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
