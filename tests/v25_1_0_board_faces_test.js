'use strict';

// v25.1.0 계약 — 보드 가시성: 유닛 초상 (사용자 0825).
//
// 사용자: "가시성이 별론데? 이미지가 필요할 것 같아 각 유닛에 대한"
//
// ① 갈 수 있는 유닛 보드의 모든 행에 유닛 초상이 붙는다 — 카탈로그
//    image 가 있으면 <img class="v25-face">, 없으면 이름 첫 글자
//    판(.v25-ph)으로 줄맞춤을 지킨다(행 수 = 초상 수).
// ② 행 레이아웃은 그리드(초상 | 이름·배지 | 상태)다.  적대 검증 반영:
//    초상은 1행 고정(2행 span 은 경고 없는 행에서 빈 암시적 2행이 초상
//    높이를 나눠 텍스트가 들뜬다), 행 셀렉터는 button.v25-row(공용
//    프리미티브 .v153-screen button 0,1,1 이 패딩을 이기는 사문화 봉합).
// ③ HUD 결함 봉합: v25.0.1 은 전역 버튼 숨김(display:none !important)이
//    보드 행(button.v25-row)까지 먹어 HUD 보드가 그룹 제목만 그렸다.
//    적대 검증 반영 — 전역 숨김에 :not(.v25-row)를 더하면 특이성이
//    (1,2,1)로 올라 v216 동결 경고의 '게임 결과' 버튼 예외(1,1,1)까지
//    이긴다: 숨김 규칙은 원형 유지, 행만 동특이성(1,1,1) 후순위
//    !important 로 되살린다.  창은 560px 고정·스크롤 불가 — 그룹당
//    3행 + 연성 경합 줄 숨김(⚠ 경고만 유지)으로 높이를 지킨다.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const appSrc=read('ord_app.js');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_clear_stats.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,App=context.ORDApp.App,units=context.ORD_TMO_UNITS;
const richCounts=(()=>{const counts={};for(const u of units)if(['common','uncommon','special'].includes(C.tierKey(u)))counts[u.id]=2;counts[C.WISP_ID]=8;return counts;})();
const richState=C.normalizeState(units,{counts:richCounts,currentAbilities:{}},{manualCounts:{}});
const mkApp=()=>{
  const app=Object.create(App.prototype);
  app.state={mode:'magic',magicRoute:'auto',locks:[],rerollsUsed:0,navFamily:'none',navPerk:'',transcendUsed:0,seraphUsed:0,snapshot:null,secondUpperId:''};
  app.upperLock=()=>null;
  return app;
};

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① 초상 — 보드 모든 행에 유닛 이미지(또는 첫 글자 판)',()=>{
  const app=mkApp();
  const html=app.renderV25GoBoard(richState,{mode:'magic'});
  const rows=(html.match(/class="v25-row/g)||[]).length;
  const faces=(html.match(/v25-face/g)||[]).length;
  assert(rows>=8,'보드 행이 부족하다');
  assert.strictEqual(faces,rows,`행 수(${rows})와 초상 수(${faces})가 다르다`);
  assert(html.includes('<img class="v25-face"'),'초상 img 부재');
  // 카탈로그 image 가 있는 유닛은 img 로, 없는 유닛은 .v25-ph 로 —
  // 소스 계약(대체 판이 이름 첫 글자를 그린다).
  assert(appSrc.includes('loading="lazy"'),'초상 lazy 로딩 소실');
  assert(appSrc.includes('v25-face v25-ph')&&appSrc.includes('unitName.charAt(0)'),'무이미지 대체 판 소실');
});

test('② 그리드 — 초상 | 이름·배지 | 상태 레이아웃 (양 시트)',()=>{
  for(const file of ['ord_ui_v20.css','ord_cockpit_v15.css']){
    const css=read(file);
    assert(css.includes('button.v25-row{display:grid'),`${file} 행 그리드(button 승격) 소실`);
    assert(css.includes('.v25-row .v25-face{width:46px'),`${file} 초상 스타일 소실`);
    assert(!css.includes('grid-row:1/span 2'),`${file} 초상 2행 span 부활(경고 없는 행 텍스트 들뜸 회귀)`);
    assert(css.includes('i.v25-ph'),`${file} 대체 판 스타일 소실`);
    assert(css.includes('.v25-warns{grid-column:2/span 2'),`${file} 경고 줄 그리드 배치 소실`);
  }
  assert(read('ord_ui_v20.css').includes('.v25-row.ok .v25-face'),'도달 가능 행 초상 강조 소실');
});

test('③ HUD — 보드 행 되살림(동특이성 후순위) + 높이 다이어트',()=>{
  const hud=read('ord_hud_desktop.html');
  // 전역 숨김은 원형 유지 — :not(.v25-row) 추가는 특이성 역전으로 v216
  // 동결 경고의 '게임 결과' 버튼 예외를 죽인다(적대 검증).
  assert(hud.includes('button:not(.v151-recovery-row){display:none !important'),'HUD 전역 버튼 숨김 원형 소실');
  assert(!hud.includes('button:not(.v151-recovery-row):not(.v25-row)'),'전역 숨김 특이성 역전 회귀(:not(.v25-row) 셀렉터)');
  assert(hud.includes('#ord-hud-root .v216-freeze-note button{display:inline !important'),'v216 동결 경고 버튼 예외 소실');
  // 행 되살림: 동특이성(1,1,1) 후순위 !important.
  assert(hud.includes('#ord-hud-root button.v25-row{display:grid !important'),'HUD 보드 행 표시 규칙 소실(전역 숨김에 먹힘)');
  assert(hud.indexOf('button:not(.v151-recovery-row){display:none !important')<hud.indexOf('#ord-hud-root button.v25-row{display:grid !important'),'행 표시 규칙이 전역 숨김보다 앞(후순위 아님)');
  assert(hud.includes('#ord-hud-root .v25-row .v25-face'),'HUD 초상 다이어트 소실');
  // 높이 다이어트: 560px 고정·스크롤 불가 창 — 그룹당 3행 + 연성 경합 숨김.
  assert(hud.includes('.v25-row:nth-of-type(n+4){display:none !important'),'HUD 그룹당 3행 다이어트 소실');
  assert(hud.includes('#ord-hud-root .v25-clash{display:none')&&hud.includes('#ord-hud-root .v25-clash.hard{display:inline'),'연성 경합 숨김·⚠ 유지 소실');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V25_1_0_BOARD_FACES ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
