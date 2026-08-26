'use strict';

// v26.0.0 계약 — 보조 모드 전면 재설계 (사용자 0826).
//
// 사용자: "지금까지 만든 프로그램은 모두 잊어. 완전히 새롭게 할꺼야.
// 티모지지를 보고 내가 직접 첫희귀함 전설 상위를 결정할꺼고 이 프로그램은
// 보조 용도로만 사용할꺼야."
//
// ① 만들 수 있는 전설급: 지금 보유 재료로 조합이 닫히는 전설급만(하드
//    결손 없음), 보유·원장 금지(세라핌 소진, 50라 전 변화됨 등) 제외.
// ② 역할 필터: 끝딜/단일/광보잡/스턴/이감/방깎/유틸 — 필터를 켜면 그
//    역할 유닛만 남는다(카탈로그 roleProfile 축 판정).
// ③ 겹침 영향: 전설 하나를 찍으면 stockAfter 재계산으로 사라지는
//    선택지·선위 밀림을 보여준다 — 아무것도 소비하지 않는다.
// ④ 상위 실측 조합: 상위를 고르면 클리어 코퍼스의 동반 전설(top8
//    등장률)과 2상위 파트너(페어 판수)를 보여준다.
// ⑤ 현재 파티 스펙: 실보유 완성 유닛 기준 게이지.
// ⑥ 화면: 플레이 화면 = 상태 스트립 + 보조 보드.  처방·확인 카드,
//    다음 제작 레일, v25 보드, v24.3 스트립은 화면에서 은퇴.
//    HUD 는 항상 보조 보드를 받는다.

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
  app.state={mode:'magic',magicRoute:'auto',locks:[],currentRound:20,rerollsUsed:0,navFamily:'none',navPerk:'',transcendUsed:0,seraphUsed:0,changedUsed:0,snapshot:null,secondUpperId:'',v26Filter:'',v26PickId:'',v26ComboUpperId:'',pendingReroll:null};
  app.upperLock=()=>null;
  app.actualRound=()=>20;
  return app;
};

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① 제작 가능 전설급 — 하드 결손 없음·보유 제외·원장 게이트 미러',()=>{
  const app=mkApp();
  const data=app.v26CraftData(richState);
  assert(data&&data.rows.length>=5,'제작 가능 목록이 비었다');
  for(const row of data.rows){
    assert(C.isLegendish(row.unit),`전설급 아닌 유닛: ${row.unit.name}`);
    assert(C.num(richState.counts[row.unit.id])<=0,`보유 유닛이 목록에: ${row.unit.name}`);
    const solve=C.recipeSolve(richState.db,row.unit.id,richState.counts);
    assert(!(solve.hardMissing||[]).length,`하드 결손 유닛이 목록에: ${row.unit.name}`);
    assert(!C.isChanged(row.unit),'50라 전인데 변화됨이 목록에 있다');
  }
  // 정렬: 지금 가능 우선 → 선위 부족 오름차순.
  for(let i=1;i<data.rows.length;i++){
    const a=data.rows[i-1],b=data.rows[i];
    if(a.ready!==b.ready){assert(a.ready,'지금 가능이 뒤로 밀림');continue;}
    assert(a.gap<=b.gap,'선위 부족 정렬 위반');
  }
  // v26.1(사용자: "게임을 키지도 않았는데 만들 수 있는 전설급이 뜨는
  // 이유를 모르겠어"): 목록은 내 희귀·특별·안흔을 실제로 소비하거나
  // 지금 바로 가능한 것만 — 빈손(게임 전)이면 비어 있어야 한다.
  for(const row of data.rows)assert(row.eats.length>0||row.ready,`재료 소비 없는 선위-전액 경로가 목록에: ${row.unit.name}`);
  const emptyState=C.normalizeState(units,{counts:{},currentAbilities:{}},{manualCounts:{}});
  const eApp=mkApp();
  const eData=eApp.v26CraftData(emptyState);
  assert.strictEqual((eData&&eData.rows||[]).length,0,'빈손(게임 전)인데 전설급 목록이 뜬다');
  // 원장 게이트: 세라핌 소진 시 세라핌 부재.
  const gApp=mkApp();gApp.state.seraphUsed=1;
  const gData=gApp.v26CraftData(richState);
  assert(!gData.rows.some(row=>C.isSeraph(row.unit)),'세라핌 소진인데 세라핌이 목록에 있다');
  // 캐시: counts 변경 시 재계산.
  const someLegend=(data.rows[0]||{}).unit;
  const bumped={};for(const [id,n] of Object.entries(richCounts))bumped[id]=n;
  bumped[someLegend.id]=1;
  const bumpedState=C.normalizeState(units,{counts:bumped,currentAbilities:{}},{manualCounts:{}});
  const after=app.v26CraftData(bumpedState);
  assert(!after.rows.some(row=>row.unit.id===someLegend.id),'보유 처리된 전설이 캐시에 남음(스테일)');
});

test('② 역할 필터 — 끝딜/단일 등 필터 시 그 역할만 남는다',()=>{
  const app=mkApp();
  const data=app.v26CraftData(richState);
  const FILTERS={end:r=>C.num(r.end)>0,single:r=>C.num(r.single)>0,bossFrenzy:r=>!!(r.boss||r.frenzy),stun:r=>C.num(r.stun)>0};
  for(const [key,pred] of Object.entries(FILTERS)){
    app.state.v26Filter=key;
    const html=app.renderV26Craft(richState);
    // 렌더된 행 id 를 뽑아 전부 역할 판정을 만족하는지 검사.
    const ids=[...html.matchAll(/data-act="v26-pick" data-id="([^"]+)"/g)].map(m=>m[1]);
    for(const id of ids){
      const row=data.rows.find(item=>String(item.unit.id)===id);
      assert(row,`렌더 행이 데이터에 없다: ${id}`);
      assert(pred(row.role),`${key} 필터인데 역할 불일치: ${displayName(row)}`);
    }
  }
  function displayName(row){return row.unit.name;}
  // 칩 배선.
  app.state.v26Filter='';
  const html=app.renderV26Craft(richState);
  assert(html.includes('data-act="v26-filter"')&&html.includes('끝딜')&&html.includes('단일'),'역할 필터 칩 부재');
});

test('③ 겹침 영향 — 사라짐은 stockAfter 재검산과 일치, 소비 없음',()=>{
  const app=mkApp();
  const data=app.v26CraftData(richState);
  const before=JSON.stringify(richState.counts);
  // 재료를 실제로 먹는 첫 후보를 선택.
  const pick=data.rows.find(row=>row.ready&&row.eats.length)||data.rows[0];
  app.state.v26PickId=String(pick.unit.id);
  const impact=app.v26PickImpact(richState,data);
  assert(impact&&impact.row.unit.id===pick.unit.id,'선택 영향 계산 부재');
  const solve=C.recipeSolve(richState.db,pick.unit.id,richState.counts);
  // 적대 검증(v26) 확정 규약: 재검산 재고에는 제작 결과물 자체가 +1 로
  // 들어간다(정본 빌드 관례 — 안 넣으면 찍은 전설을 재료로 쓰는 원형→
  // 왜곡 2단계 후보가 거짓 '사라짐'으로 표시된다).
  assert(appSrc.includes('after[id]=C.num(after[id])+1'),'제작 결과물 +1 관례 소실(왜곡 2단계 거짓 사라짐 회귀)');
  const afterStock=Object.assign({},solve.stockAfter||{});
  afterStock[String(pick.unit.id)]=(afterStock[String(pick.unit.id)]||0)+1;
  // 전수 재검산: 사라짐 수 == (+1 반영) 재고로 하드 결손이 생기는 후보 수.
  const expectGone=data.rows.filter(row=>String(row.unit.id)!==String(pick.unit.id)).filter(row=>{
    const re=C.recipeSolve(richState.db,row.unit.id,afterStock);
    return (re.hardMissing||[]).length>0;
  }).length;
  assert.strictEqual(impact.gone.length,expectGone,`사라짐 수 불일치: 표시 ${impact.gone.length} vs 재검산 ${expectGone}`);
  // 아무것도 소비하지 않는다.
  assert.strictEqual(JSON.stringify(richState.counts),before,'표시 시뮬이 실제 counts 를 바꿨다');
  // 렌더 배선: 선택 행 뒤에 영향 패널.
  const html=app.renderV26Craft(richState);
  assert(html.includes('v26-impact')&&html.includes('이걸 만들면'),'겹침 영향 패널 렌더 부재');
  assert(html.includes('아무것도 소비하지 않습니다'),'비소비 안내 부재');
});

test('④ 상위 실측 조합 — 동반 전설 top8 + 2상위 파트너 페어 판수',()=>{
  const app=mkApp();
  app.state.v26ComboUpperId='090H';
  const html=app.renderV26Combos(richState);
  const st=C.clearStatsFor('090H');
  assert(st&&st.partners&&st.partners.length,'090H 실측 데이터 전제 실패');
  for(const partner of st.partners.slice(0,3))assert(html.includes(C.esc?C.esc(partner.name):partner.name),`동반 전설 누락: ${partner.name}`);
  assert(html.includes(`클리어 실측 ${st.games}판`),'실측 판수 표기 부재');
  assert(html.includes('동반 실측')&&html.includes('data-opt="v26ComboUpperId"'),'2상위 파트너·상위 선택 배선 부재');
  // 페어 판수 내림차순.
  const pairGames=[...html.matchAll(/동반 실측 (\d+)판/g)].map(m=>Number(m[1]));
  for(let i=1;i<pairGames.length;i++)assert(pairGames[i-1]>=pairGames[i],'페어 판수 정렬 위반');
});

test('⑤ 현재 파티 스펙 — 실보유 기준 게이지',()=>{
  const app=mkApp();
  app.observedDeficits=()=>({requirements:[{key:'slow',label:'이동속도 감소',current:40,target:100,gap:60,required:true},{key:'stun',label:'스턴',current:1,target:0.7,gap:0,required:true}],clearRows:[{key:'slow',label:'이동속도 감소',current:40,target:100,gap:60,required:true}],source:'TMO 실제 완성 유닛'});
  const html=app.renderV26Spec(richState,{});
  assert(html.includes('v22-gauge')&&html.includes('이동속도 감소'),'스펙 게이지 부재');
  assert(html.includes('TMO 실제 완성 유닛'),'실보유 출처 표기 부재');
  assert(html.indexOf('이동속도 감소')<html.indexOf('스턴'),'결손 우선 정렬 위반');
});

test('⑥ 화면·HUD — 보조 보드 단독 마운트, 처방 표면 은퇴',()=>{
  // renderCoach 슬라이스: 보조 보드만 마운트, 카드·레일·v25 보드 부재.
  const coach=appSrc.slice(appSrc.indexOf('  renderCoach(state,plan,phase,clock,health){'),appSrc.indexOf('  renderCoachDetails(state,plan,open=false){'));
  assert(coach.includes('renderV26Assistant(state,plan,health)'),'보조 보드 마운트 부재');
  for(const gone of ['renderV151NextAction','renderV153Preview','renderV25GoBoard','v243LineGuard','v243RerollSweep','v25-coach-opinion','next-preview'])
    assert(!coach.includes(gone),`은퇴 표면이 플레이 화면에 남음: ${gone}`);
  assert((coach.match(/data-region="/g)||[]).length===1&&coach.includes('data-region="next-action"'),'플레이 화면 region 계약 위반(next-action 1개)');
  // v25 보드·v24.3 스트립 메서드는 삭제됐다(대체: v26).
  for(const dead of ['v25GoBoardData(state,plan){','renderV25GoBoard(state,plan){','v243RerollSweep(plan){','v243LineGuard(state,plan){'])
    assert(!appSrc.includes(dead),`은퇴 메서드가 남아 있다: ${dead}`);
  // 렌더 결과 자체 검증(스텁 최소): 상태 스트립 + 보조 보드.
  const app=mkApp();
  app.renderV153Status=()=>'<section data-region="game-status"></section>';
  app.renderV238Onboarding=()=>'';
  app.v22Phase=()=>({key:'p3',num:'③',label:'테스트'});
  const html=app.renderCoach(richState,{mode:'magic'},{},{},{ready:true,key:'ok'});
  assert(html.includes('v26-board')&&html.includes('만들 수 있는 전설급')&&html.includes('상위 실측 조합')&&html.includes('현재 파티 스펙'),'보조 4기능 렌더 부재');
  assert(!html.includes('v151-action ')&&!html.includes('v25-board'),'은퇴 카드/보드가 렌더에 남음');
  // 수신 끊김 정직성: 배너 + 마지막 패 기준 안내.
  const stale=app.renderCoach(richState,{mode:'magic'},{},{},{ready:false,key:'stale'});
  assert(stale.includes('TMO 수신 대기')&&stale.includes('마지막으로 읽은 패 기준'),'수신 끊김 배너 부재');
  // HUD 배선: 항상 보조 보드.
  const boot=fs.readFileSync(path.join(ROOT,'ord_boot_desktop.js'),'utf8');
  assert(boot.includes('[data-region="next-action"] .v26-board'),'HUD 보드 급전 선택자 부재');
  assert(!boot.includes(':not(.v25-opinion)'),'은퇴한 카드 우선 선택자가 남음');
  const hud=read('ord_hud_desktop.html');
  assert(hud.includes('#ord-hud-root .v26-board')&&hud.includes('#ord-hud-root .v26-chips,#ord-hud-root .v26-b2'),'HUD 보조 보드 다이어트 부재');
  // 적대 검증(v26) 봉합 핀: HUD 다이어트(실측 조합 블록 통째 숨김 +
  // 스펙 게이지 done 숨김·열린 4개 상한), F6 오버레이 스펙 예외,
  // waiting 잠금 수동 해제 승계, 배너 버튼 primary(HUD 중계 도달).
  assert(hud.includes('#ord-hud-root .v26-b2')&&hud.includes('.v22-gauge.done{display:none !important')&&hud.includes('.v22-gauges>.v22-gauge:nth-of-type(n+5){display:none !important'),'HUD 스펙·콤보 다이어트 소실(560px 넘침 회귀)');
  const css=read('ord_ui_v20.css');
  assert(css.includes('body.ord-overlay-mode .v26-spec .v22-gauges{display:grid!important'),'F6 미니 패널 스펙 예외 소실');
  // v26.1 한눈 레이아웃: 보드 2단(전설급 | 조합+스펙) + 카드 그리드.
  assert(css.includes('.v26-board{display:grid')&&css.includes('.v26-b1{grid-column:1;grid-row:1/span 2'),'보드 2단 배치 소실');
  assert(css.includes('.v26-block .v25-group{display:grid;grid-template-columns:repeat(auto-fill'),'카드 그리드 소실');
  assert(css.includes('@media (max-width:1040px){.v26-board{display:flex'),'좁은 화면 세로 폴백 소실');
  assert(appSrc.includes('data-act="accept-snapshot">현재 보이는 패로 계속'),'waiting 잠금 수동 해제 버튼 소실');
  assert(appSrc.includes('class="primary" data-act="cancel-reroll"'),'리롤 대기 해제 버튼 primary 소실(HUD 중계 불가 회귀)');
  assert(appSrc.includes("'v26-pick','v26-filter']"),'보조 보드 조작 감사 기록 등재 소실');
  // 온보딩·README 철학 문구.
  assert(appSrc.includes('코치가 조합을 정해주지 않습니다'),'온보딩 철학 문구 부재');
  assert(fs.readFileSync(path.join(__dirname,'..','README.txt'),'utf8').includes('보조 보드'),'README 갱신 부재');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V26_0_0_ASSISTANT ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
