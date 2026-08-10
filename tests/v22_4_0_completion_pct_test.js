'use strict';
// v22.4.0 계약 — 코치 계산 완성 % 전면 배선 (사용자 요청, 2026-08-10).
//
// 사용자: "모든 캐릭터를 만들기 전에 환산으로 완성 %가 나왔으면 좋겠어
// 헷갈려 상위 저격에도 %가 있어서 당장 뭐가 저격하기 좋은지도 알고 싶어"
//
// v20.2 에 만들어 두고 화면에 배선하지 않았던 ledgerCompletion(정확 원장
// 완성도)을 지금 할 일 카드·다음 제작·상세 모달·저격 모달에 단다.
// 저격 모달은 데스크톱에서 항상 0인 TMO % 대신 원장 % 로 표시·정렬하고
// "지금 가까운 저격 TOP 3" 스트립으로 즉답한다.

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
const C=context.ORDCore,App=context.ORDApp.App;

test('① 원장 완성도: 빈 패 0% · 재료 채우면 상승 · 완주 시 100/보유',()=>{
  const empty=C.normalizeState(context.ORD_TMO_UNITS,{counts:{},currentAbilities:{}},{manualCounts:{}});
  // H30h 샬롯 크래커 = G20h + 킨에몬(J20h) + 720h
  const zero=C.ledgerCompletion(empty.db,'H30h',empty.counts);
  assert(zero&&zero.percent===0&&zero.needTotal>0,'빈 패 완성도가 0이 아니다');
  const partial=C.normalizeState(context.ORD_TMO_UNITS,{counts:{J20h:1,G20h:1},currentAbilities:{}},{manualCounts:{}});
  const mid=C.ledgerCompletion(partial.db,'H30h',partial.counts);
  assert(mid.percent>zero.percent&&mid.percent<100,`부분 보유가 반영되지 않음: ${mid.percent}%`);
  const full=C.normalizeState(context.ORD_TMO_UNITS,{counts:{H30h:1},currentAbilities:{}},{manualCounts:{}});
  const owned=C.ledgerCompletion(full.db,'H30h',full.counts);
  assert(owned.owned&&owned.percent===100,'보유 유닛이 100/보유로 나오지 않음');
});

test('② % 칩이 지금 할 일 카드·다음 제작·상세 모달에 배선됐다',()=>{
  const stub=()=>{const obj=Object.create(App.prototype);
    obj.state={mode:'physical',locks:[],pendingTransaction:null,secondUpperId:'',labResearch:{},rerollsUsed:0,vetoIds:[],snapshot:null,manualCounts:{}};
    obj.actualRound=()=>30;obj.upperLock=()=>null;obj.observedDeficits=()=>({clearRows:[]});
    obj.commandInfo=()=>({hasVerified:false});obj.v157SecondUpperCallout=()=>'';obj.v157LongshotHint=()=>'';
    obj.v151ActionFacts=()=>'';obj.v153Icon=()=>'<i></i>';obj.v151StoryTag=()=>'';obj.v216BargesTag=()=>'';return obj;};
  const state=C.normalizeState(context.ORD_TMO_UNITS,{counts:{},currentAbilities:{}},{manualCounts:{}});
  state.wisp=5;
  const unit=state.db.byId.get('H30h');
  const obj=stub();
  const decision={state:'ACT_NOW',label:'제작',reason:'r',assessment:{},action:{id:'H30h',name:'샬롯 크래커',wispCost:3,wispAfter:2,unit,quote:{wisp:{cost:3},solve:{rareUse:{},direct:[],lowestMissing:{}}},deltas:[]}};
  const html=obj.renderV151NextAction(state,{v15Decision:decision,postLegendDecision:{awaiting:false}},{ready:true});
  assert(html.includes('v224-pct'),'카드 제목에 완성도 칩이 없다');
  for(const marker of ['${this.v224PctChip(state,unit)}${this.v151StoryTag(unit)}','코치 계산 완성도'])assert(appSrc.includes(marker),`배선 누락: ${marker}`);
  assert((appSrc.match(/v224PctChip\(state,unit\)/g)||[]).length>=2,'다음 제작 목록 칩 배선 누락');
});

test('③ 저격 모달: 원장 % 배지 + 지금 가까운 저격 TOP 3',()=>{
  const obj=Object.create(App.prototype);
  obj.state={snipeSearch:'',snapshot:null,manualCounts:{},locks:[]};
  obj.upperLock=()=>null;
  obj._snipeOpen=true;
  const state=C.normalizeState(context.ORD_TMO_UNITS,{counts:{},currentAbilities:{}},{manualCounts:{}});
  const html=obj.renderSnipeModal(state);
  assert(html.includes('v224-snipe-top')&&html.includes('저격 TOP'),'TOP 3 스트립이 없다');
  assert(html.includes('v224-pct'),'저격 행 % 배지가 없다');
  assert(!appSrc.includes('pct:C.completionPercent(state,unit)'),'죽은 TMO % 정렬이 남아 있다(데스크톱 항상 0)');
  for(const sel of ['.v224-pct{','.v224-snipe-top{'])assert(css.includes(sel),`CSS 누락: ${sel}`);
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V22_4_0_COMPLETION_PCT ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
