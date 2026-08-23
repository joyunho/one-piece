'use strict';

// v23.11.0 계약 — 사용자(0821): "난 왜캐 조잡하다고 생각하지 정보가 전혀
// 정리되어 있지 않아."
//
// 원인: 포렌식·요청 릴리스마다 지금 할 일 카드에 보조 블록이 추가만
// 되어(수치 타일·명령어·회복 목표·2상위 콜아웃·저격 힌트·근거 …) 카드
// 하나에 최대 14개 블록이 쌓였다.
//
// 계약(정보 계층):
//  · 항상 보임 — 제목·이유·조합·(있을 때만) 경고·승인 버튼.
//  · '자세히' 접힘(.v2311-more) 하나에 — 수치 변화 타일·명령어·회복
//    목표·2상위 콜아웃·저격 힌트·근거.  정보 삭제 아님(DOM 에는 전부
//    남는다 — 정리).
//  · 보류(HOLD)·재료 보호(PREPARE) 카드는 사유 확인이 본론 — 자동 열림.
//  · HUD 에서는 접힘 통째로 숨김.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const App=context.ORDApp.App;

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);
function stub(){
  const obj=Object.create(App.prototype);
  obj.state={mode:'physical',locks:[],pendingTransaction:null,secondUpperId:'',upperPreviewId:'',postLegendRoute:'',navFamily:'none',navPerk:'',labResearch:{},rerollsUsed:0,vetoIds:[],recentMainUppers:[]};
  obj.actualRound=()=>30;obj.upperLock=()=>null;obj.observedDeficits=()=>({clearRows:[]});
  obj.commandInfo=()=>({hasVerified:false});obj.v157SecondUpperCallout=()=>'<div class="v157-second-callout">콜아웃</div>';
  obj.v157LongshotHint=()=>'';obj.v151ActionFacts=()=>'<div class="v151-action-facts">근거</div>';
  obj.v153Icon=()=>'<i></i>';obj.v151StoryTag=()=>'';obj.v216BargesTag=()=>'';obj.v224PctChip=()=>'';
  obj.renderV151Recovery=()=>'<div class="v151-recovery">회복</div>';
  return obj;
}
const decisionOf=(status)=>({state:status,label:'제작',reason:'r',assessment:{},action:{id:'190H',name:'후보',wispCost:3,wispAfter:5,unit:null,quote:{wisp:{cost:3},solve:{rareUse:{},direct:[],lowestMissing:{}}},deltas:[{key:'slow',label:'이감',before:10,after:30,target:100,delta:20}]}});
const render=(status)=>stub().renderV151NextAction({db:null,wisp:5},{v15Decision:decisionOf(status),postLegendDecision:{awaiting:false}},{ready:true,key:'ok',label:'연결'});

test('① 보조 블록이 자세히 접힘 안으로 — 수치 타일·회복·콜아웃·근거',()=>{
  const html=render('ACT_NOW');
  const fold=html.indexOf('<details class="v2311-more"');
  assert(fold>=0,'자세히 접힘 부재');
  for(const cls of ['v151-deltas','v151-recovery','v157-second-callout','v151-action-facts']){
    const at=html.indexOf(cls);
    assert(at>fold,`${cls} 가 접힘 밖(항상 노출)에 있다`);
  }
  const foot=html.indexOf('v151-action-foot');
  assert(html.indexOf('</details>')<foot,'승인 버튼 줄(foot)이 접힘 안에 들어갔다 — 항상 보여야');
  assert(html.indexOf('v151-action-main')<fold,'제목 블록은 접힘 밖이어야');
});

test('② 접힘 기본값 — ACT_NOW 닫힘, HOLD·PREPARE 자동 열림',()=>{
  assert(!/<details class="v2311-more" open>/.test(render('ACT_NOW')),'실행 카드가 기본 열림이다');
  assert(/<details class="v2311-more" open>/.test(render('HOLD')),'보류 카드가 자동 열림이 아니다');
  assert(/<details class="v2311-more" open>/.test(render('PREPARE')),'재료 보호 카드가 자동 열림이 아니다');
});

test('③ HUD 에서는 접힘 숨김',()=>{
  assert(read('ord_hud_desktop.html').includes('#ord-hud-root .v2311-more{display:none !important;}'),'HUD 숨김 규칙 부재');
  for(const file of ['ord_ui_v20.css','ord_cockpit_v15.css'])assert(read(file).includes('.v2311-more>summary'),`${file} 접힘 스타일 부재`);
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_11_0_CARD_HIERARCHY ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);