'use strict';

// v27.1.0 계약 — 보조 보드 UI 업그레이드 (사용자 0827 스크린샷).
//
// 사용자: "UI 진짜 이게 최선이야? 더 업그레이드 시켜봐"
// 스크린샷 결함 두 가지가 출발점이다:
// ① TOP3 카드가 .v26-partner 4열 그리드(동반 전설용)를 재활용해 5자식
//    TOP3 에서 이름이 20px 열로 밀려 한 글자씩 세로로 붕괴했다.
// ② 1라 빈손인데 선위 66 짜리 상위가 추천됐다 — 위습이 흔함을 대신 사
//    주므로 빈손에도 조합이 '닫혀서' 생긴 v26.1 과 같은 소음.
//
// 계약: TOP3 전용 행 레이아웃 / 빈손 추천 0 / 긴 이름(괄호 스펙) 분리
// 표기 / 빈 상태 안내 패널 / 시각 위계(머리 마커·호버) + 미러.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const css=read('ord_ui_v20.css'),cockpit=read('ord_cockpit_v15.css');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_clear_stats.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,App=context.ORDApp.App,units=context.ORD_TMO_UNITS;
const mkApp=()=>{
  const app=Object.create(App.prototype);
  app.state={mode:'magic',magicRoute:'auto',locks:[],currentRound:20,rerollsUsed:0,navFamily:'none',navPerk:'',transcendUsed:0,seraphUsed:0,changedUsed:0,snapshot:null,secondUpperId:'',v26Filter:'',v26PickId:'',v26ComboUpperId:'',v26Page:0,v26ComboSearch:'',superKumaOwned:true,story10Reward:'',pendingReroll:null};
  app.upperLock=()=>null;
  app.actualRound=()=>20;
  return app;
};
const richCounts=(()=>{const counts={};for(const u of units)if(['common','uncommon','special'].includes(C.tierKey(u)))counts[u.id]=2;counts[C.WISP_ID]=8;return counts;})();
const richState=C.normalizeState(units,{counts:richCounts,currentAbilities:{}},{manualCounts:{}});
const emptyState=C.normalizeState(units,{counts:{},currentAbilities:{}},{manualCounts:{}});

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① TOP3 전용 행 레이아웃 — 파트너 그리드 재활용 붕괴의 재발 방지',()=>{
  const app=mkApp();
  const picks=app.v26UpperPicks(richState);
  assert(picks.length>=1,'rich 패에서 추천이 비었다');
  const html=app.renderV26Combos(richState);
  // 전용 행: 픽 수만큼 v26-top3-row, 1위에는 top 강조.
  assert((html.match(/class="v26-top3-row/g)||[]).length===picks.length,'TOP3 행 수 불일치');
  assert(html.includes('class="v26-top3-row top"'),'1위 top 강조 부재');
  assert(html.includes('v26-top3-grid'),'TOP3 전용 그리드 컨테이너 부재');
  // TOP3 행이 .v26-partner 를 재활용하지 않는다(세로 붕괴의 원인).
  const top3Block=html.slice(html.indexOf('v26-top3'),html.indexOf('v26-combo-search'));
  assert(!top3Block.includes('class="v26-partner"'),'TOP3 가 다시 파트너 버튼을 재활용한다');
  // 본문 스택: 본명(괄호 앞) + 선위·실측 메타, 전체 이름은 title 로.
  for(const pick of picks){
    const full=String((pick.unit.name||'')).replace(/\s+/g,' ');
    const row=html.slice(html.indexOf(`data-id="${pick.unit.id}"`,html.indexOf('v26-top3-grid')));
    assert(/v26-top3-meta">선위 \d+ · /.test(row.slice(0,600)),`선위·실측 메타 줄 부재: ${full}`);
  }
  // CSS: 전용 그리드 정의 + 옛 재활용 규칙 소거.
  assert(css.includes('button.v26-top3-row{display:grid;grid-template-columns:26px 42px minmax(0,1fr)'),'TOP3 행 그리드 CSS 부재');
  assert(!css.includes('.v26-top3 .v26-partner{'),'옛 파트너 재활용 규칙 잔존');
  assert(css.includes('.v26-top3-main b{font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'),'TOP3 본명 말줄임 CSS 부재');
});

test('② 빈손 추천 0 — 1라 게임 전에는 TOP3 블록 자체가 없다',()=>{
  const app=mkApp();app.state.mode='';app.actualRound=()=>1;app.state.currentRound=1;
  assert.strictEqual(app.v26UpperPicks(emptyState).length,0,'빈손인데 상위가 추천된다');
  const html=app.renderV26Combos(emptyState);
  assert(!html.includes('지금 패 추천 TOP3'),'빈손인데 TOP3 블록이 렌더된다');
  // 원칙 파리티(적대 검증 반영): 추천은 흔함·위습 밖의 내 패를 실제로
  // 소비하거나, 지금 바로 갈 수 있어야(선위 충당 완료) 한다 — 상위
  // 조합은 보유 '전설급'도 소비하므로 희귀·특별·안흔만 인정하면 전설을
  // 쥔 패가 공백이 된다.
  const rApp=mkApp();
  for(const pick of rApp.v26UpperPicks(richState)){
    const solve=C.recipeSolve(richState.db,pick.unit.id,richState.counts);
    // consumed 의 원장 선행조건('hard' 버킷 — 초월 쿠마 등)은 손패가 아니다.
    const eats=Object.keys(solve.consumed||{}).some(id=>{const mat=richState.db.byId.get(String(id));if(!mat)return false;const tier=C.tierKey(mat);return ['rare','special','uncommon'].includes(tier)||(C.isLegendish(mat)&&tier!=='hard');});
    assert(eats||C.num(solve.wispCost)<=C.num(richState.counts[C.WISP_ID]),`내 패를 안 쓰는 선위 전액 추천: ${pick.unit.name}`);
  }
  // 전설을 쥔 패 공백 방지: 전설급 위주 패에서도 추천이 나온다.
  const legendCounts={};for(const u of units)if(C.isLegendish(u)&&!C.isSeraph(u)&&!C.isChanged(u))legendCounts[u.id]=2;
  legendCounts[C.WISP_ID]=50;
  const legendState=C.normalizeState(units,{counts:legendCounts,currentAbilities:{}},{manualCounts:{}});
  assert(mkApp().v26UpperPicks(legendState).length>=1,'전설급 패인데 추천이 공백이다');
});

test('③ 긴 이름 분리 표기 — 파트너·페어·검색 본명 + title 전체 이름',()=>{
  const app=mkApp();app.state.mode='';
  // 페어가 있는 상위를 골라 페어·파트너 표기를 확인한다.
  const best=richState.db.uppers.map(u=>({u,g:C.num((C.clearStatsFor(u.id)||{}).games)})).sort((a,b)=>b.g-a.g)[0];
  app.state.v26ComboUpperId=best.u.id;
  const html=app.renderV26Combos(richState);
  const pairsAt=html.indexOf('v26-pairs');
  assert(pairsAt>=0,'페어 블록 부재(픽스처 확인)');
  const pairsBlock=html.slice(pairsAt,html.indexOf('</div>',pairsAt));
  // 괄호 스펙이 붙은 상위 이름이 페어 버튼 본문에 그대로 노출되지 않는다.
  const pairButtons=[...pairsBlock.matchAll(/<button class="v26-pair-row"[^>]*title="([^"]*)"[^>]*><b>([^<]*)<\/b>/g)];
  assert(pairButtons.length>=1,'페어 버튼 파싱 실패');
  // 적대 검증 반영: 정체 괄호(베가펑크 (검호))는 본명의 일부라 남는다 —
  // 계약은 ① 라벨은 title(전체 이름)의 접두, ② 같은 목록 안 라벨 유일,
  // ③ 숫자 스펙 괄호가 붙은 이름은 실제로 축약된다(충돌 예외 제외).
  const pairLabelSet=pairButtons.map(([,,label])=>label);
  assert.strictEqual(new Set(pairLabelSet).size,pairLabelSet.length,`페어 라벨 충돌: ${pairLabelSet.join(' / ')}`);
  for(const [,title,label] of pairButtons)assert(title.startsWith(label),'title 이 전체 이름을 담지 않는다');
  assert(pairButtons.some(([,title,label])=>title!==label&&/\([^)]*\d/.test(title)),'숫자 스펙 괄호 축약이 전혀 일어나지 않는다');
  // 검색 결과 버튼도 본명 표기 + title 전체 이름.
  const sApp=mkApp();sApp.state.mode='';sApp.state.v26ComboSearch='센고쿠';
  const sHtml=sApp.renderV26Combos(richState);
  const found=[...sHtml.matchAll(/<button data-act="v26-combo-set"[^>]*title="([^"]*)"[^>]*>([^<]*)</g)];
  assert(found.length>=1,'검색 결과 버튼 부재');
  for(const [,title,label] of found)assert(title.startsWith(label.replace(/ · \d+판$/,'')),'검색 라벨이 전체 이름의 접두가 아니다');
  // 적대 검증 반영 두 가지 — ① 정체 괄호는 본명의 일부: 베가펑크 변형
  // 4종이 전부 '베가펑크'로 뭉개지지 않는다.  ② 같은 목록 안 라벨 충돌
  // 금지: 같은 글자 버튼이 서로 다른 상위를 지정하면 안 된다.
  const vApp=mkApp();vApp.state.mode='';vApp.state.v26ComboSearch='베가펑크';
  const vHtml=vApp.renderV26Combos(richState);
  const vFound=[...vHtml.matchAll(/<button data-act="v26-combo-set"[^>]*data-id="([^"]*)"[^>]*>([^<]*)</g)];
  assert(vFound.length>=2,'베가펑크 변형 검색 결과 부족(픽스처 확인)');
  const vLabels=vFound.map(([,,label])=>label.replace(/ · \d+판$/,''));
  assert.strictEqual(new Set(vLabels).size,vLabels.length,`변형 상위 라벨 충돌: ${vLabels.join(' / ')}`);
  // TOP3 노트에 짝 안 맞는 괄호 문자열이 노출되지 않는다.
  const anyApp=mkApp();
  const top3Html=anyApp.renderV26Combos(richState);
  for(const [,note] of [...top3Html.matchAll(/v26-top3-note">([^<]*)</g)]){
    const open=(note.match(/\(/g)||[]).length,close=(note.match(/\)/g)||[]).length;
    assert(open===close,`TOP3 노트 괄호 불균형: ${note}`);
  }
  assert(css.includes('button.v26-partner b{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'),'파트너 본명 말줄임 CSS 부재');
});

test('④ 빈 상태 안내 패널 — 죽은 한 줄 대신 v26-empty',()=>{
  const app=mkApp();app.state.mode='';
  const html=app.renderV26Craft(emptyState);
  assert(html.includes('class="v26-empty"'),'빈 상태 패널 부재');
  assert(html.includes('지금 가진 희귀·재료로 닿는 전설급이 없습니다'),'빈 상태 안내 문구 소실');
  assert(!html.includes('v22-note'),'옛 v22-note 한 줄이 남아 있다');
  // 필터 활성 빈 상태도 같은 패널.
  const fApp=mkApp();fApp.state.v26Filter='stun';
  const fHtml=fApp.renderV26Craft(emptyState);
  assert(fHtml.includes('class="v26-empty"'),'필터 빈 상태 패널 부재');
  assert(css.includes('.v26-empty{display:flex;flex-direction:column;align-items:center'),'빈 상태 패널 CSS 부재');
});

test('⑤ 시각 위계 + 정본 미러 — 머리 마커·호버·콕핏 미러',()=>{
  assert(css.includes(".v26-block>header b::before{content:'◆'"),'블록 머리 마커 부재');
  // 적대 검증(특이성): .v153-screen small (0,1,1) 프리미티브에 지지 않게
  // small.클래스 (0,1,1, 후순위)로 쓴다 — 클래스 단독 회귀 금지.
  assert(css.includes('small.v26-top3-meta{color:var(--gold)'),'TOP3 메타 특이성 승격 소실');
  assert(css.includes('small.v26-top3-note{'),'TOP3 노트 특이성 승격 소실');
  assert(!/[^.\w]\.v26-top3-meta\{/.test(css),'클래스 단독 .v26-top3-meta 규칙 회귀');
  assert(css.includes('button.v26-row:hover{border-color:var(--gold)'),'행 호버 반응 부재');
  assert(css.includes('button.v26-top3-row:hover{border-color:var(--gold)'),'TOP3 호버 반응 부재');
  assert(css.includes('.v26-board{font-variant-numeric:tabular-nums}'),'숫자 고정폭 부재');
  // 콕핏 시트는 죽은 시트지만 정본 미러 관례를 유지한다.
  for(const cls of ['.v26-top3-grid','button.v26-top3-row','.v26-empty'])assert(cockpit.includes(cls),`콕핏 미러 부재: ${cls}`);
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V27_1_0_BOARD_UI ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
