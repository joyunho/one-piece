'use strict';

// v19.8: 사용자 피드백 5건 + 0731 80라 판 포렌식 대응 배선 고정.
//   ① 판단 잠금 빈 화면 → 마지막 패 결손·회복 목표 채움.
//   ② "다음 판단" → 다음 제작 3개 큐(검증 경로→파티 순서→차선→회복).
//   ③ 희귀→전설 6칸 + 내 희귀 사용 명시 + 노리기 채움.
//   ④ 포렌식: 생존 자원 소모 경고 · 이감 초과 표기 · 1.5스턴 해제 라벨.
//   ⑤ 최근 5판 메인 기록 → "최근에 안 간 각" 배지.

const assert=require('assert');
const path=require('path');
const fs=require('fs');
const vm=require('vm');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const read=name=>fs.readFileSync(path.join(EXT,name),'utf8');
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}

const app=read('ord_app.js');
const css=read('ord_ui_v20.css');

check('① 판단 잠금 상태가 마지막 패 결손·회복 목표를 채운다',()=>{
  assert(app.includes('v158-blocked-spec'),'잠금 상태 결손 요약 없음');
  assert(app.includes('마지막 유효 패 기준'),'라벨 없음');
  // v19.9.2: 회복 목표에 조합식이 붙으면서 state 인자가 추가됐다.
  assert(/if\(!health\.ready\)\{[\s\S]{0,900}renderV151Recovery\(decision,'HOLD',state\)/.test(app),'잠금 상태 회복 목표 없음');
  assert(css.includes('.v158-blocked-spec'),'스타일 없음');
});

check('② 다음 제작 큐 — 5개 상한(v19.9) + 소스 사슬 + 보존 섹션 제거',()=>{
  const preview=app.slice(app.indexOf('renderV153Preview(state,plan){'),app.indexOf('renderV153CraftableLegends(state,plan){'));
  // v19.9(사용자 요청): "다음제작을 5개까지 늘려줘" · "지금 보존은 필요 없을
  // 것 같고" — 보존 근거는 남는 희귀 패널의 사용·보류 접이에 그대로 있다.
  assert(preview.includes('queue.length>=5'),'5개 상한 없음');
  for(const source of ["'검증 경로'","'파티 순서 · 가변'","'차선'","'회복 목표'","'상위 후보 경로'"]){
    assert(preview.includes(source),`소스 누락: ${source}`);
  }
  assert(preview.includes('v158-queue'),'큐 마크업 없음');
  assert(!preview.includes('지금 보존'),"'지금 보존' 섹션은 v19.9에서 제거됐다");
  assert(preview.includes('패가 바뀌면 다시 계산'),'먼 미래 미고정 문구 없음');
  // 보유 유닛은 큐에 안 올린다(이미 만든 것을 다음 제작으로 표시 금지).
  assert(preview.includes('C.num((state.counts||{})[id])>0)return'),'보유 유닛 제외 없음');
});

check('③ 희귀→전설 6칸 + 내 희귀 사용 + 노리기 채움',()=>{
  const craft=app.slice(app.indexOf('renderV153CraftableLegends(state,plan){'),app.indexOf('renderV153UnusedRare(state,plan){'));
  // v19.10(외부 점검 8-1): 보유 희귀 사용 카드와 노리기 카드가 구역으로
  // 분리됐다 — 6칸 상한은 사용 카드 기준.
  assert(craft.includes('nowRows.slice(0,6)'),'6칸이 아님');
  assert(craft.includes('v1910-upcoming-head'),'노리기 구역 분리 없음');
  assert(craft.includes('내 희귀 사용'),'사용 희귀 명시 없음');
  assert(craft.includes('rows.length>6'),'전체 보기 임계 갱신 안 됨');
  const rowsFn=app.slice(app.indexOf('v153RareCraftRows(state,plan){'),app.indexOf('renderV152RareCraftable(state,plan){'));
  assert(rowsFn.includes('upcoming:true'),'노리기 채움 없음');
  assert(rowsFn.includes('ranked.length<6'),'6칸 미만일 때만 채우는 조건 없음');
  assert(rowsFn.includes('shortTotal>4)continue'),'노리기 부족 상한 없음');
  assert(css.includes('.v153-craft-cards.v158-six'),'6칸 그리드 스타일 없음');
});

check('④ 포렌식 대응 — 생존 자원 소모 경고(런타임) · 초과·해제 라벨',()=>{
  assert(app.includes('v158-consume-warn'),'소모 경고 마크업 없음');
  assert(app.includes('초과'),'이감 초과 라벨 없음');
  // v19.9.7(0802 교정): 해제 라벨은 규칙 폐기와 함께 사라졌다 — 대신
  // "마지막에 반드시 채움"(fillLast) 라벨이 물딜·마딜 공통으로 남는다.
  assert(!app.includes('relaxedBySlow'),'폐기된 v18.9 해제 라벨이 남아 있다');
  assert(app.includes('마지막에 반드시 채움'),'fillLast 라벨 없음');
  // 런타임: 광보잡 결손이 열린 채 광보잡 희귀(아카이누 P10h)를 소모하는
  // 제작 카드 — 0731 r19 센고쿠 케이스 재현.
  const context={console};context.window=context;vm.createContext(context);
  context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
    vm.runInContext(read(file),context,{filename:file});
  }
  const App=context.ORDApp.App,C=context.ORDCore;
  const akainu=context.ORD_TMO_UNITS.find(u=>u.id==='P10h');
  assert(akainu&&(C.roleProfile(akainu).boss||C.roleProfile(akainu).frenzy),'픽스처 전제: P10h 아카이누가 광보잡이어야 함');
  const state=C.normalizeState(context.ORD_TMO_UNITS,{counts:{P10h:1},units:[]},{});
  const appObj=Object.create(App.prototype);
  appObj.state={mode:'physical',locks:[],pendingTransaction:null,secondUpperId:''};
  appObj.actualRound=()=>19;
  appObj.upperLock=()=>null;
  appObj.observedDeficits=()=>({clearRows:[{key:'bossFrenzy',label:'광보잡 2',gap:1,required:true}]});
  appObj.commandInfo=()=>({hasVerified:false});
  appObj.renderV151Recovery=()=>'';
  appObj.v157SecondUpperCallout=()=>'';
  appObj.v157LongshotHint=()=>'';
  appObj.v151ActionFacts=()=>'';
  appObj.v153Icon=()=>'<i></i>';
  appObj.v151StoryTag=()=>'';
  const decision={state:'ACT_NOW',label:'센고쿠 제작',reason:'완성도 우선',action:{id:'630h',name:'센고쿠',wispCost:0,wispAfter:5,unit:context.ORD_TMO_UNITS.find(u=>u.id==='630h'),quote:{wisp:{cost:0},solve:{rareUse:{P10h:1},direct:[],lowestMissing:{}}},deltas:[]}};
  const html=appObj.renderV151NextAction(state,{v15Decision:decision,postLegendDecision:{awaiting:false}},{ready:true});
  assert(html.includes('v158-consume-warn'),'광보잡 희귀 소모 경고가 안 뜸');
  assert(html.includes('광보잡'),'소모 경고에 결손 이름 없음');
  // 결손이 닫혀 있으면 경고 없음.
  appObj.observedDeficits=()=>({clearRows:[]});
  const quiet=appObj.renderV151NextAction(state,{v15Decision:decision,postLegendDecision:{awaiting:false}},{ready:true});
  assert(!quiet.includes('v158-consume-warn'),'결손이 없는데도 경고가 뜸');
});

check('⑤ 최근 5판 메인 기록 + "최근에 안 간 각" 배지',()=>{
  assert(app.includes('recentMainUppers'),'최근 메인 기록 없음');
  assert(app.includes("Array.isArray(stored.recentMainUppers)"),'복원 정규화 없음');
  assert(app.includes('v158-fresh'),'배지 마크업 없음');
  assert(app.includes('최근 5판에 안 간 각'),'배지 문구 없음');
  assert(css.includes('.v158-fresh'),'배지 스타일 없음');
});

console.log(`\n${checks}/${checks} v19.8 batch checks passed.`);
