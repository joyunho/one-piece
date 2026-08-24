'use strict';

// v24.3.0 계약 — 0823 패배(v24.0.0, 58라) 포렌식 + 사용자 지시 4건.
//
// 실측(0823 로그): 상위 확정 24라 → 희귀 7장 전부 '보류' → 리롤 판정
// 40라 → 리롤 사용 0회.  에이스 왜곡은 결합 조합식만 표시.  스토리
// 스텝퍼 입력 0회(전 판 공통).
//
// ① "첫 상위를 정했으면 … 리롤을 돌릴만한 게 … 정한 다음에": 확정 시
//    리롤 원장 즉시 개방(미확정만 25라) + 계획 밖 희귀 리롤 정리 스트립.
// ② "30라운드가 넘었으면 라인을 막기 위해 전설을 하나 더": 상위 재료
//    대기 구간에 최저 선위 D+ 전설 라인 방어 안내.
// ③ "에이스 왜곡도 … 에이스 전설부터 만드는 법을 알려주고 그다음에
//    왜곡": 원형 전설 미보유 시 1단계/2단계 분리 표시.
// ④ "스토리 단계 그거 필요없어": 스텝퍼 은퇴(세부는 v22_1_0 재핀).

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
const richCounts=(()=>{const counts={};for(const u of units)if(['common','uncommon','special'].includes(C.tierKey(u)))counts[u.id]=9;counts[C.WISP_ID]=12;return counts;})();
const richState=C.normalizeState(units,{counts:richCounts,currentAbilities:{}},{manualCounts:{}});

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① 리롤 게이트 — 확정 즉시 개방(미확정 25라) + 정리 스트립',()=>{
  assert(appSrc.includes('rerollGateRound=this.upperLock()?0:25'),'확정 즉시 게이트 부재');
  const app=Object.create(App.prototype);
  app.state={rerollsUsed:0,navFamily:'none',navPerk:''};
  app.rerollLimit=()=>2;
  app.upperLock=()=>({id:'V80H'});
  const plan={v15Decision:{rare:{reroll:[{name:'모몬가',reroll:1}]}}};
  const html=app.v243RerollSweep(plan);
  assert(html.includes('리롤 정리')&&html.includes('모몬가')&&html.includes('잔여 2회'),'리롤 정리 스트립 부재');
  app.upperLock=()=>null;
  assert.strictEqual(app.v243RerollSweep(plan),'','상위 미확정에 리롤 정리가 뜬다');
  app.upperLock=()=>({id:'V80H'});
  assert.strictEqual(app.v243RerollSweep({v15Decision:{rare:{reroll:[]}}}),'','계획 밖 희귀가 없는데 스트립이 뜬다');
});

test('② 30라+ 라인 방어 — 상위 재료 대기 구간에 최저 선위 D+ 전설 안내',()=>{
  const app=Object.create(App.prototype);
  app.state={mode:'',navFamily:'none',navPerk:''};
  app.upperLock=()=>({id:'V80H'});
  app.actualRound=()=>32;
  const plan={mode:'',v15Decision:{label:'확정 상위 재료 보호'}};
  const html=app.v243LineGuard(richState,plan);
  assert(html.includes('라인 방어'),'라인 방어 안내 부재');
  assert(html.includes('승인 카드가 최종 확인'),'권위 경계 문구 부재');
  // 안내된 전설은 리그 E·F 가 아니다(이름으로 역검증).
  const named=units.filter(u=>C.isLegendish(u)&&html.includes(C.esc(C.displayNameOf(u))));
  assert(named.length>=1,'안내 전설을 역해석 못 함');
  for(const u of named){const lg=C.storyLeagueGrade(u,C.storyGrade(u));assert(!(lg&&lg.leagueRanked&&/^[EF]$/.test(String(lg.leagueTier))),`E·F 전설이 라인 방어로 안내됨: ${u.name}`);}
  app.actualRound=()=>20;app._v243GuardKey='';
  assert.strictEqual(app.v243LineGuard(richState,plan),'','30라 전에 라인 방어가 뜬다');
  app.actualRound=()=>32;app._v243GuardKey='';
  assert.strictEqual(app.v243LineGuard(richState,{mode:'',v15Decision:{label:'지금 제작'}}),'','제작 가능 구간에 라인 방어가 뜬다');
});

test('③ 왜곡 단계 표시 — 1단계 원형 전설 → 2단계 왜곡 합성 (배선+데이터 불변식)',()=>{
  assert(appSrc.includes('v243-stage')&&appSrc.includes('1단계 · 원형')&&appSrc.includes('2단계 · 왜곡 합성'),'단계 표시 배선 부재');
  assert(appSrc.includes('C.isWarped(target)'),'왜곡 판정 배선 부재');
  // 데이터 불변식: 모든 왜곡 유닛의 조합에 원형 전설급이 정확히 있다.
  const db=C.buildDb(units);
  const warped=units.filter(u=>C.isWarped(u));
  assert(warped.length>=3,'왜곡 유닛 픽스처 부족');
  for(const u of warped){
    const base=(u.stuffs||[]).map(s=>db.byId.get(String(s.id))).find(m=>m&&C.isLegendish(m));
    assert(base,`왜곡 ${u.name}의 원형 전설을 조합에서 못 찾음 — 1단계 표시 불가`);
  }
});

test('④ 스토리 스텝퍼 은퇴 — 플레이 화면·핸들러 잔재 없음',()=>{
  assert(!appSrc.includes('v221StoryBlock(){'),'스텝퍼 메서드 잔재');
  assert(!appSrc.includes('data-act="story-stage-step"'),'스텝퍼 버튼 잔재');
  assert(appSrc.includes('v243LineGuard(state,plan)')&&appSrc.includes('v243RerollSweep(plan)'),'대체 스트립 배선 부재');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V24_3_0_CONFIRM_FLOW ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
