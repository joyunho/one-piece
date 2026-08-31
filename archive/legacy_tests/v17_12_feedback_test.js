'use strict';

// v17.12: 6건 피드백 회귀 가드.
//  1) 특수재료 게이트(그린블러드 등 레시피 없는 특수)만 남은 상위(베가펑크
//     계열)는 숨기지 않고 게이트 배지로 방향 후보·칩 목록에 남는다.
//     단 제작 승인(feasible)은 실제 보유 전까지 불가.
//  2) 라인딜 부족(lineSelf==='support') 상위는 파티 필수 역할에 보조딜을
//     강제로 넣는다(사용자 요청 6 후반).
//  3) 유닛 강화 풀 가정: 연구소 4종 체크 + 등급 공업 Lv21이 기본값이고,
//     rev178 마이그레이션이 이전 저장분을 1회 풀로 올린다.
//  4) 추천 이유는 현재 희귀 패 근거(소비 희귀 → 상위, 남는 희귀 → 결손을
//     닫는 전설급) 문장으로 나온다.
//  5) UI 배선: 자동 모드 방향 확정 전 스펙 플레이스홀더 · 해적선 한 줄 +
//     전체 모달 · 게이트 칩 · 오로성 컴팩트 CSS.

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
const originalWarn=console.warn;
console.warn=()=>{};
for(const file of [
  'ord_units_data.js',
  'ord_upper_memo.js',
  'ord_synergy_memo.js',
  'ord_data_patch.js',
  'ord_story_nonupper_data.js',
  'ord_story_upper_data.js',
  'ord_upper_combat_data.js',
  'ord_upper_skill_digest.js',
  'ord_upper_skill_dps.js',
  'ord_core.js',
  'ord_squad_planner.js',
  'ord_v15_model.js',
  'ord_v15_ledger.js',
  'ord_v15_policy.js',
  'ord_v15_engine.js',
  'ord_app.js'
])require(path.join(EXT,file));
console.warn=originalWarn;

const C=global.ORDCore;
const M=global.ORDV15Model;
const E=global.ORDV15Engine;
const P=global.ORDSquadPlanner;
const App=global.ORDApp.App;
const normalizeInitialState=global.ORDApp._test.normalizeInitialState;
const units=global.ORD_TMO_UNITS;
const GREENBLOOD_ID='unit_1779016778159_2512';

const tests=[];
function test(name,fn){tests.push([name,fn]);}

function upperStageModel(extraCounts){
  const find=(pat,groupPat)=>units.find(u=>pat.test(C.nameOf(u))&&(!groupPat||groupPat.test(C.groupName(u))));
  const counts=Object.assign({'810e':30},extraCounts||{});
  for(const u of [find(/^마르코/,/전설/),find(/^킬러/,/히든|전설/)]){assert(u,'전설 유닛 탐색 실패');counts[u.id]=1;}
  for(const pat of [/센토마루/,/와이퍼/,/^브룩/,/핸콕/,/^비비/,/^카쿠/]){
    const u=units.find(x=>pat.test(C.nameOf(x))&&/희귀/.test(C.groupName(x)));
    assert(u,`희귀 유닛 탐색 실패: ${pat}`);
    counts[u.id]=(counts[u.id]||0)+1;
  }
  return M.build({catalog:units,snapshot:{source:'test',sessionId:'s',seq:1,at:1,dataChangedAt:1,counts,currentAbilities:{},wispCountFound:true,wispCount:30},settings:{mode:'',magicRoute:'auto',currentRound:26,gorosei:'none',postLegendRoute:'upper',superKumaOwned:true,upperResearchLevel:21},locks:[]});
}

test('특수재료 게이트: 그린블러드 미보유 베가펑크 계열이 gatedUppers 칩으로 남는다',()=>{
  const rows=E._test.upperRouteCandidates(upperStageModel(),[]);
  assert(Array.isArray(rows.gatedUppers),'gatedUppers 칩 목록 누락');
  assert(rows.gatedUppers.length>0,'게이트 상위가 하나도 없다');
  for(const item of rows.gatedUppers){
    assert(item.id&&item.name,'게이트 상위 식별 정보 누락');
    assert(Array.isArray(item.items)&&item.items.length>0,'게이트 재료 목록 누락');
  }
  const gatedNames=rows.gatedUppers.map(item=>item.name).join('|');
  assert(/베가펑크/.test(gatedNames),`베가펑크 계열이 게이트 목록에 없다: ${gatedNames}`);
  // 게이트 상위는 정규 카드 6자리를 소비하지 않는다(칩 전용) — 정규
  // 후보(핸콕 영원 등)가 밀려나는 회귀 방지.
  assert.strictEqual(rows.filter(row=>row.specialGate).length,0,'게이트 상위가 정규 카드 자리를 차지했다');
  assert(rows.length>0&&rows.length<=6,'후보 카드 수 계약 위반');
  // 그린블러드를 실제로 보유하면 해당 상위의 게이트가 풀린다(게이트는
  // 미보유 특수재료에만 붙는다).
  const owned=E._test.upperRouteCandidates(upperStageModel({[GREENBLOOD_ID]:1}),[]);
  const stillGreenGated=(owned.gatedUppers||[]).filter(item=>item.items.some(mat=>mat.id===GREENBLOOD_ID));
  assert.strictEqual(stillGreenGated.length,0,'그린블러드 보유 후에도 그린블러드 게이트가 남았다');
});

test('보조딜 필수: lineSelf=support 상위는 requirementRows에 subdamage 필수 행이 강제된다',()=>{
  const support=units.filter(u=>C.isUpper(u)).find(u=>C.upperStrategy(u).lineSelf==='support'&&!(C.upperStrategy(u).needs||[]).some(need=>need.key==='subdamage'));
  assert(support,'subdamage need가 없는 support 상위 탐색 실패');
  const spec=Object.assign({},P._test.finalOnlySpec({db:C.buildDb(units),counts:{}},'magic'),{main:1});
  const rows=P._test.requirementRows(spec,[],C.familyOf(support)==='magic'?'magic':'physical',C.familyOf(support)==='magic'?'singleEnd':'physical',{gorosei:'none'},support).rows;
  const sub=rows.find(row=>row.key==='subdamage');
  assert(sub,'subdamage 행이 없다');
  assert.strictEqual(sub.required,true,'subdamage가 필수가 아니다');
  assert(sub.meta&&sub.meta.mechanic,'mechanic 표기 누락');
});

test('강화 풀 가정: 기본값 = 연구소 4종 체크 + Lv21, rev178 마이그레이션 1회 풀 전환',()=>{
  // 새 설치 기본값.
  const fresh=normalizeInitialState(null);
  assert.strictEqual(fresh.settingsRevision,178);
  assert.deepStrictEqual({attack:fresh.labResearch.attack,slow:fresh.labResearch.slow,hpRegen:fresh.labResearch.hpRegen,mpRegen:fresh.labResearch.mpRegen},{attack:true,slow:true,hpRegen:true,mpRegen:true});
  assert.strictEqual(fresh.upperResearchLevel,21);
  // 이전 저장분(rev177, 미체크·Lv1)은 풀로 1회 올린다.
  const migrated=normalizeInitialState({settingsRevision:177,labResearch:{attack:false,slow:false,hpRegen:false,mpRegen:false,round:null},upperResearchLevel:1});
  assert.strictEqual(migrated.upperResearchLevel,21,'rev177→178 공업 레벨 풀 전환 실패');
  assert.strictEqual(migrated.labResearch.attack&&migrated.labResearch.slow&&migrated.labResearch.hpRegen&&migrated.labResearch.mpRegen,true,'rev177→178 연구소 풀 전환 실패');
  // 178 이후 사용자가 낮춘 값은 존중한다.
  const respected=normalizeInitialState({settingsRevision:178,labResearch:{attack:false,slow:true,hpRegen:true,mpRegen:true,round:null},upperResearchLevel:7});
  assert.strictEqual(respected.upperResearchLevel,7,'사용자 조정 레벨이 무시됐다');
  assert.strictEqual(respected.labResearch.attack,false,'사용자 해제 체크가 무시됐다');
  // 데이터 상한(21) 초과 입력은 클램프.
  assert.strictEqual(normalizeInitialState({settingsRevision:178,upperResearchLevel:99}).upperResearchLevel,21);
});

test('추천 이유: 소비 희귀 → 상위, 남는 희귀 → 결손 닫는 전설급 문장(현재 패 근거)',()=>{
  const app=Object.create(App.prototype);
  app.state={mode:'physical',magicRoute:'auto'};
  app.actualRound=()=>26;
  app._normalizedCacheKey='t';
  const upper=units.find(u=>C.isUpper(u)&&C.familyOf(u)!=='magic');
  assert(upper,'물리 상위 탐색 실패');
  const rare=units.find(u=>/희귀/.test(C.groupName(u)));
  const state=C.normalizeState(units,{source:'test',sessionId:'s',seq:1,at:1,counts:{'810e':10},currentAbilities:{},wispCountFound:true,wispCount:10},{mode:'physical',magicRoute:'auto',currentRound:26,gorosei:'none'});
  const row={id:upper.id,name:C.nameOf(upper),unit:upper,routeKey:'physical',mode:'physical',feasible:true,clearValue:{dpsCover:.8},quote:{rareUse:{[rare.id]:1},after:Object.assign({},state.counts)},projectedAssessment:{requirements:[{key:'bossFrenzy',label:'광보잡',required:true,gap:1,current:0,target:1}]}};
  const html=app.v151ClearWhy(state,{v15Decision:{},settings:{}},row);
  assert(html.includes('v151-clear-why'),'이유 블록 누락');
  assert(html.includes(C.nameOf(rare).slice(0,3)),'소비 희귀 이름이 문장에 없다');
  assert(html.includes('소비해'),'소비 문형 누락');
  assert(/결손|충족/.test(html),'결손/충족 결론 누락');
  // 다른 상위(다른 소비 희귀)는 다른 문장이 나와야 한다 — "이유가 다
  // 똑같다" 회귀 방지.
  const rare2=units.filter(u=>/희귀/.test(C.groupName(u)))[1];
  const row2=Object.assign({},row,{id:`${upper.id}-x`,name:'다른상위',quote:{rareUse:{[rare2.id]:2},after:Object.assign({},state.counts)}});
  const html2=app.v151ClearWhy(state,{v15Decision:{},settings:{}},row2);
  assert.notStrictEqual(html,html2,'서로 다른 상위의 추천 이유가 동일하다');
});

test('UI 배선(소스 검증): 자동 모드 플레이스홀더 · 해적선 한 줄+모달 · 게이트 칩 · 오로성 컴팩트',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  // 6) 자동 모드: 방향 확정 전 스펙 기준 없음 + 확정 후 기준 칩.
  assert(app.includes('방향 확정 전 — 기준 없음'),'자동 모드 플레이스홀더 누락');
  assert(app.includes('v151-mode-resolved'),'방향 기준 칩 누락');
  assert(app.includes('마딜 1상위(단끝) 기준')&&app.includes('마딜 2상위(토키) 기준'),'마딜 경로 기준 라벨 누락');
  // 2) 해적선: 2번 패널 한 줄 + 전체 모달.
  assert(app.includes('v151-ship-line'),'해적선 한 줄 요약 누락');
  assert(app.includes('data-act="ship-plan"'),'해적선 전체 모달 버튼 누락');
  assert(app.includes('renderV151ShipModal'),'해적선 모달 렌더 누락');
  // 5) 게이트 칩 + 배지.
  assert(app.includes('특수재료 확보 시 열리는 상위'),'게이트 칩 제목 누락');
  assert(app.includes('v151-gate-badge'),'게이트 배지 누락');
  // 3) 카드: 상태 요약 줄 제거(추천 이유 + 필요 선위만).
  assert(!app.includes('지금 제작 가능\':`선위 ${C.num(row.wispGap)} 부족`'),'카드 상태 줄이 남아 있다');
  // 연구 입력 상한.
  assert(app.includes('max="21"'),'공업 레벨 입력 상한 누락');
  const css=fs.readFileSync(path.join(EXT,'ord_ui_v20.css'),'utf8');
  assert(css.includes('.v151-gorosei-selects'),'오로성 선택 2열 CSS 누락');
  assert(css.includes('.v151-gated-uppers'),'게이트 칩 CSS 누락');
  assert(css.includes('.v151-ship-line'),'해적선 한 줄 CSS 누락');
  // 3) 이유 문장 잘림 방지 오버라이드.
  assert(css.includes('.v151-upper-candidates article .v151-cost-line,.v151-upper-candidates article .v151-clear-why'),'이유/선위 줄바꿈 오버라이드 누락');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.stack||error);}
}
console.log(`V17_12_FEEDBACK ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
