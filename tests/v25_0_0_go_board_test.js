'use strict';

// v25.0.0 계약 — 선택형 코치 전환 (사용자 방향 전환, 0824).
//
// 사용자: "완벽히 상황을 보고 프로그램이 조합을 짜주는건 불가능이라고
// 결론을 내렸어.  한쪽 패가 과소비 되는걸 방지한 상태에서 내가 갈 수
// 있는 유닛들을 보여주는 방식으로 해보자"
//
// ① 갈 수 있는 유닛 보드: 상위(정본 중복 제거·배타 티어 게이트)와
//    전설·히든(스토리 리그 D 이상, 미보유만)을 도달 거리순으로 편다.
//    정렬은 처방이 아니라 도달 거리다 — 선택은 사용자.
// ② 패 경합(과소비 방지): 같은 보유 재료(희귀·특별·안흔)를 원하는
//    후보들을 행마다 표시하고, 최상단에 경합 재료 지도를 편다.
// ③ 확정 상위 보호: 확정 상위 트리 재료·선위 몫을 침범하는 행에 경고.
// ④ 강등: 처방 카드(ACT_NOW/PREPARE/HOLD, 위급 제외)는 접힌 '코치
//    계산 의견'으로 — 결정·확인 카드(선택지·원장 정합)는 그대로 위.

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

test('① 보드 — 상위·전설 D+ 도달 거리순, 미보유만, 정본 중복 없음',()=>{
  const app=mkApp();
  const data=app.v25GoBoardData(richState,{mode:'magic'});
  assert(data&&data.rows.length>=8,'보드가 비었다');
  const uppers=data.rows.filter(row=>row.group!=='legend'),legends=data.rows.filter(row=>row.group==='legend');
  assert(uppers.length>=3&&legends.length>=3,'그룹 구성이 비었다');
  // 정본 중복 없음.
  const canons=uppers.map(row=>String(C.canonicalUpperId(row.unit.id)));
  assert.strictEqual(new Set(canons).size,canons.length,'상위 정본 중복');
  // 전설 그룹: 리그 E·F 없음(사용자 규칙 D 이상) · 보유 유닛 없음.
  for(const row of legends){
    const league=C.storyLeagueGrade(row.unit,C.storyGrade(row.unit));
    assert(!(league&&league.leagueRanked&&/^[EF]$/.test(String(league.leagueTier))),`E·F 전설이 보드에 있다: ${row.unit.name}`);
    assert(C.num(richState.counts[row.unit.id])<=0,`보유 전설이 보드에 있다: ${row.unit.name}`);
  }
  // 도달 거리 사전식: feasible 우선 → gap → (동버킷) cost.
  for(let i=1;i<legends.length;i++){
    const a=legends[i-1],b=legends[i];
    if(a.feasible!==b.feasible){assert(a.feasible,'도달 가능이 뒤로 밀림');continue;}
    assert(a.gap<=b.gap||a.gap===b.gap,'gap 정렬 위반');
  }
});

test('② 패 경합 — 같은 재료를 원하는 후보 표시 + 경합 지도 자기 일관성',()=>{
  const app=mkApp();
  const data=app.v25GoBoardData(richState,{mode:'magic'});
  assert(data.pressure.length>=1,'풍족 패 전수 후보에서 경합이 0 — 계산 회귀');
  for(const entry of data.pressure){
    const wanters=data.rows.filter(row=>row.eats.some(eat=>eat.id===entry.id));
    assert(wanters.length>=2,`경합 재료 ${entry.name}를 원하는 후보가 2 미만`);
    assert(entry.total>entry.owned,'수요가 보유 이하인데 경합 표시');
  }
  const html=app.renderV25GoBoard(richState,{mode:'magic'});
  assert(html.includes('경합')&&html.includes('갈 수 있는 유닛'),'경합·보드 렌더 부재');
  assert(html.includes('한쪽에 몰아쓰면 다른 길이 막힙니다'),'과소비 안내 문구 부재');
});

test('③ 확정 상위 보호 — 트리 재료 침범 행 경고',()=>{
  const app=mkApp();
  app.upperLock=()=>({id:'V80H'});
  const data=app.v25GoBoardData(richState,{mode:'magic'});
  assert(data.lockName,'확정 상위 표기 부재');
  assert(data.rows.some(row=>row.invadesUpper.length>0),'상위 재료 침범 플래그가 하나도 없다(풍족 패)');
  const html=app.renderV25GoBoard(richState,{mode:'magic'});
  assert(html.includes('확정 상위 재료 침범'),'침범 경고 렌더 부재');
});

test('④ 강등 — 처방 카드는 접힌 코치 의견, 결정 카드는 그대로 위',()=>{
  const stub=marker=>{
    const app=mkApp();
    app.state.currentRound=45;
    app.observedDeficits=()=>({clearRows:[]});
    app.renderV151NextAction=()=>marker?'<div class="v151-action act_now v25-opinion"><i data-test="card"></i></div>':'<div class="v151-action choice"><i data-test="card"></i></div>';
    app.renderV153Status=()=>'<section data-region="game-status"></section>';
    app.renderV153Preview=()=>'<i></i>';
    app.renderV25GoBoard=()=>'<i data-test="board"></i>';
    app.actualRound=()=>45;
    return app.renderCoach(richState,{mode:'magic',v15Decision:{state:'ACT_NOW'},postLegendDecision:{awaiting:false}},{},{},{ready:true,key:'ok'});
  };
  const demoted=stub(true);
  assert(demoted.includes('<details class="v25-coach-opinion"'),'처방 카드가 접힘으로 강등되지 않음');
  assert(demoted.indexOf('data-test="board"')<demoted.indexOf('data-test="card"'),'보드가 처방 카드보다 뒤에 있다');
  const primary=stub(false);
  assert(!primary.includes('v25-coach-opinion'),'결정 카드가 강등됐다');
  assert(primary.indexOf('data-test="card"')<primary.indexOf('data-test="board"'),'결정 카드가 보드보다 뒤에 있다');
  // 소스 계약: 강등 마커는 처방 3상태 + 위급 제외.
  assert(appSrc.includes("['ACT_NOW','PREPARE','HOLD'].includes(status)&&!v216.critical?' v25-opinion'"),'강등 마커 조건 소실');
});

test('⑤ 문구·CSS — 철학 전환 배선',()=>{
  assert(appSrc.includes('갈 수 있는 유닛')&&appSrc.includes('코치 계산 의견'),'보드·의견 문구 부재');
  assert(appSrc.includes('코치가 조합을 정해주지 않습니다'),'온보딩 새 철학 문구 부재');
  assert(fs.readFileSync(path.join(__dirname,'..','README.txt'),'utf8').includes('갈 수 있는 유닛'),'README 갱신 부재');
  for(const file of ['ord_ui_v20.css','ord_cockpit_v15.css']){
    const css=read(file);
    assert(css.includes('.v25-row{')&&css.includes('.v25-coach-opinion'),`${file} 보드 스타일 부재`);
  }
});

test('⑥ 적대 검증 4건 고정 — 캐시·자동 계통·보유 상위·침범 수량',()=>{
  // ①(high) 캐시: counts 가 바뀌면(수동 패 보정 등) 보드가 재계산된다.
  const app=mkApp();
  const before=app.v25GoBoardData(richState,{mode:'magic'});
  const bumped={};for(const [id,n] of Object.entries(richCounts))bumped[id]=n;
  const someLegend=units.find(u=>C.isLegendish(u)&&C.familyOf(u)!=='physical');
  bumped[someLegend.id]=1;
  const bumpedState=C.normalizeState(units,{counts:bumped,currentAbilities:{}},{manualCounts:{}});
  const after=app.v25GoBoardData(bumpedState,{mode:'magic'});
  assert.notStrictEqual(before,after,'counts 변경에도 캐시가 낡은 보드를 반환(스테일)');
  assert(!after.rows.some(row=>row.unit.id===someLegend.id),'보유 처리된 전설이 재계산 보드에 남음');
  // ③ 자동 계통: state.mode='' 이면 plan.mode 가 physical 로 굳어도 양 계열이 보인다.
  const autoApp=mkApp();autoApp.state.mode='';
  const autoData=autoApp.v25GoBoardData(richState,{mode:'physical'});
  const fams=new Set(autoData.rows.map(row=>C.familyOf(row.unit)).filter(f=>f==='physical'||f==='magic'));
  assert(fams.has('physical')&&fams.has('magic'),'자동 모드에서 한 계열이 숨겨짐(plan.mode 필터 회귀)');
  // ④ 보유 상위: counts>0 상위(정본)는 후보에서 빠진다.
  const ownedUpper=units.find(u=>C.isUpper(u)&&C.familyOf(u)!=='physical');
  const withOwned={};for(const [id,n] of Object.entries(richCounts))withOwned[id]=n;
  withOwned[ownedUpper.id]=1;
  const ownedState=C.normalizeState(units,{counts:withOwned,currentAbilities:{}},{manualCounts:{}});
  const ownedApp=mkApp();
  const ownedData=ownedApp.v25GoBoardData(ownedState,{mode:'magic'});
  const ownedCanon=String(C.canonicalUpperId(ownedUpper.id));
  assert(!ownedData.rows.some(row=>row.group!=='legend'&&String(C.canonicalUpperId(row.unit.id))===ownedCanon),'보유 상위가 갈 수 있는 후보로 표시됨');
  // ② 침범 수량: 표시된 침범은 전부 상위 몫+후보 몫 > 보유 를 만족한다.
  const lockApp=mkApp();lockApp.upperLock=()=>({id:'V80H'});
  const lockData=lockApp.v25GoBoardData(richState,{mode:'magic'});
  const lockSolve=C.recipeSolve(richState.db,'V80H',richState.counts);
  const lockNeed=new Map(Object.entries(lockSolve.consumed||{}).map(([id,n])=>[String(id),C.num(n)]));
  for(const row of lockData.rows){
    for(const name of row.invadesUpper){
      const eat=row.eats.find(item=>item.name===name);
      assert(eat,'침범 재료를 행 소비에서 못 찾음');
      assert(C.num(lockNeed.get(eat.id))+eat.need>C.num(richState.counts[eat.id]),`수량상 무해한 재료가 침범으로 경고됨: ${name}`);
    }
  }
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V25_0_0_GO_BOARD ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
