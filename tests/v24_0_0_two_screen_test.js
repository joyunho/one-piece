'use strict';

// v24.0.0 계약 — 플레이/분석 2화면 구조 재편.
//
// 사용자(0823): "구조 자체가 문제인것같은데" → 선택지 확정: "플레이/분석
// 2화면 분리".  판 중 화면은 상태 한 줄 + 지금 할 일 카드(+뜰 때만 결정
// 카드)뿐이고, 국면 근거·최종 파티·희귀 원장·기록·도구는 전부 '분석'
// 화면으로 옮긴다 — 판 사이에만 본다.  게임 중 화면과 F8 HUD가 같은
// 내용이 된다.
//
// ① 플레이 화면(coach) = 3영역: game-status · next-action · next-preview.
//    참고 서랍(v211)·국면 패널은 없다.  스토리 스텝퍼(v221)는 게임 중
//    유일한 손 입력이라 액션 존 하단에 남는다.
// ② 분석 화면(analysis) = 4영역 세로 펼침: clear-gaps → upper-party →
//    craftable-legends → unused-rare + 기록·자료·도구 링크.  서랍·탭 없음.
// ③ 배선: 상단 스트립 '분석' 버튼, 분석→플레이/하위→분석 복귀 계층,
//    새 게임 시 플레이 복귀.  v23.9 간단 보기(simpleMode)는 완전 은퇴.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const appSrc=read('ord_app.js'),css=read('ord_ui_v20.css');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const App=context.ORDApp.App;
const stub=round=>{
  const obj=Object.create(App.prototype);
  obj.state={mode:'magic',magicRoute:'auto',virtualSpecialId:'',locks:[],currentRound:round,rerollsUsed:0,tab:'coach'};
  obj.upperLock=()=>null;
  obj.observedDeficits=()=>({clearRows:[]});
  obj.renderV151NextAction=()=>'<i data-test="next"></i>';
  obj.renderV153Status=()=>'<section data-region="game-status"><i data-test="status"></i></section>';
  obj.renderV153Preview=()=>'<i data-test="candidate"></i>';
  obj.renderV22PhasePanel=()=>'<i data-test="phase"></i>';
  obj.renderV153CraftableLegends=()=>'<i data-test="rare"></i>';
  obj.renderV153UnusedRare=()=>'<i data-test="unused"></i>';
  obj.renderV153UpperParty=()=>'<i data-test="upper"></i>';
  obj.renderDeck=()=>'<i data-test="deck"></i>';
  return obj;
};
const plan=extra=>Object.assign({v15Decision:{state:'ACT_NOW'},postLegendDecision:{awaiting:false}},extra||{});

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① 플레이 화면 — 상태 한 줄 + 지금 할 일뿐, 참고·국면은 없다',()=>{
  const html=stub(45).renderCoach({},plan(),{},{},{ready:true,key:'ok'});
  const regions=[...html.matchAll(/data-region="([^"]+)"/g)].map(match=>match[1]);
  assert.deepStrictEqual(regions,['game-status','next-action','next-preview'],'플레이 화면 영역이 3개가 아니다');
  for(const gone of ['data-region="clear-gaps"','data-region="reference"','data-region="upper-party"','data-region="craftable-legends"','data-region="unused-rare"','v211-refer','v211-tabs','v239-simple'])assert(!html.includes(gone),`플레이 화면에 남아 있다: ${gone}`);
  // v24.3 재핀: 스토리 스텝퍼(v221)는 은퇴 — 액션 존 하단은 리롤 정리·
  // 라인 방어 스트립 자리다(상위 미확정 스텁에선 둘 다 빈 문자열).
  assert(!html.includes('v221-story'),'은퇴한 스토리 스텝퍼가 플레이 화면에 남아 있다');
});

test('② 분석 화면 — 4영역 세로 펼침 + 기록·자료·도구, 서랍 없음',()=>{
  const html=stub(45).renderAuxiliaryPage('analysis',{},plan(),{ready:true,key:'ok'});
  const regions=[...html.matchAll(/data-region="([^"]+)"/g)].map(match=>match[1]);
  assert.deepStrictEqual(regions,['clear-gaps','upper-party','craftable-legends','unused-rare'],'분석 화면 영역 구성이 다르다');
  for(const key of ['phase','upper','rare','unused'])assert.strictEqual((html.match(new RegExp(`data-test="${key}"`,'g'))||[]).length,1,`분석 화면 ${key} 패널 1회 렌더 아님`);
  assert(html.includes('v240-tool-links'),'기록·자료·도구 링크가 없다');
  for(const act of ['data-act="run-log-open"','data-act="run-result-open"','data-tab="story"','data-tab="deck"','data-tab="data"','data-act="show-onboarding"'])assert(html.includes(act),`도구 링크 누락: ${act}`);
  assert(html.includes('data-act="tab" data-tab="coach"'),'플레이로 돌아가기 버튼이 없다');
  assert(!html.includes('v211-tabs')&&!html.includes('v22-drawer-close'),'분석 화면에 서랍이 있다');
});

test('③ 복귀 계층 — 분석→플레이 · 하위 페이지→분석',()=>{
  const deck=stub(45).renderAuxiliaryPage('deck',{},plan(),{ready:true,key:'ok'});
  const bar=deck.slice(deck.indexOf('v151-aux-bar'),deck.indexOf('</div>'));
  assert(bar.includes('data-tab="analysis"'),'하위 페이지가 분석으로 돌아가지 않는다');
  // 새 게임은 플레이 화면 복귀(resetGame keep).
  assert(appSrc.includes("const keep={tab:'coach',onboardingSeen"),'새 게임 시 플레이 복귀 계약 소실');
});

test('④ 배선 — 분석 탭·상단 버튼·간단 보기 완전 은퇴',()=>{
  assert(appSrc.includes("new Set(['coach','analysis','runlog','deck','data','story'])"),'REACHABLE_TABS에 analysis 없음');
  assert(appSrc.includes('v240-analysis-btn')&&appSrc.includes('data-act="tab" data-tab="analysis"'),'상단 분석 버튼 배선 없음');
  for(const gone of ["a==='toggle-simple-view'","a==='v211-tab'","a==='v22-drawer-close'",'_v22DrawerOpen','simpleMode:null,','v239-view-toggle'])assert(!appSrc.includes(gone),`은퇴한 배선이 남아 있다: ${gone}`);
  // v23.10 2상위 카드의 점프 문구도 분석 화면을 가리킨다.
  assert(appSrc.includes('상단 분석 버튼 → 최종 파티'),'2상위 카드 점프 문구가 옛 전체 보기를 가리킨다');
});

test('⑤ CSS — 플레이 단일 칼럼 + 분석 세로 펼침, 옛 그리드·서랍 규칙 제거',()=>{
  for(const sel of ['.v240-play{','.v240-analysis{','.v240-analysis-btn{','.v240-tool-links{'])assert(css.includes(sel),`ord_ui_v20.css 누락: ${sel}`);
  for(const gone of ['.v239-simple','.v211-tabs{','.v211-pane{','"action refer"','grid-template-areas'])assert(!css.includes(gone),`ord_ui_v20.css 은퇴 규칙 잔존: ${gone}`);
  const cockpit=read('ord_cockpit_v15.css');
  assert(cockpit.includes('.v240-analysis{')&&!cockpit.includes('.v239-simple'),'cockpit 미러 갱신 안 됨');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V24_0_0_TWO_SCREEN ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
