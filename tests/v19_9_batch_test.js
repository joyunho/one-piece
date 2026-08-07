'use strict';
// v19.9 배치 계약.
//
// 사용자 지시(2026-07-31): "모두 진행해주고 퍼센테이지랑 노리기 겹치는거
// 해결해줘. 뭐랑 뭐랑 뭐랑 조합해야하는지도 화면에 나오게 해주고 희귀 전설은
// 티모지지 %를 가져오게 해줘. 지금 보존은 필요 없을 것 같고 다음제작을
// 5개까지 늘려줘. 물딜은 방깎이 우선시 되어야 할 것 같아 — 최소 스턴 잡고
// 풀이감을 잡은 뒤에 스턴 1.5를 채우는거지."
//
// ① 물딜 1.5스턴 최후 규칙(코어 필수 유지 + 정책 순서 고정)
// ② 제작 카드: TMO% · 직접 조합식 · 노리기 카드 % 숨김(겹침 해소)
// ③ 승인 카드 스킵 경고(2라운드째 미이행 + 마감 역산)
// ④ 유일 마감 수단 조기 적립 경고(레드포스호 위습 26 케이스)
// ⑤ 비추천 수동 제작 감지(모비딕호 케이스 — 소스 계약)
// ⑥ 이감 구성 분해(전용·연구소·발동)
// ⑦ 새 게임 시 연구소 재확인 유도
// ⑧ 판 종료 침묵 배너(3분 무변화 → 결과 입력 유도)
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const app=read('ord_app.js'),css=read('ord_ui_v20.css');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

// 런타임 컨텍스트는 한 번만 만든다(전체 카탈로그 로드가 무겁다).
const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const App=context.ORDApp.App,C=context.ORDCore,P=context.ORDV15Policy;
const stubApp=()=>{
  const obj=Object.create(App.prototype);
  obj.state={mode:'physical',locks:[],pendingTransaction:null,secondUpperId:'',labResearch:{}};
  obj.actualRound=()=>19;
  obj.upperLock=()=>null;
  obj.observedDeficits=()=>({clearRows:[]});
  obj.commandInfo=()=>({hasVerified:false});
  obj.v157SecondUpperCallout=()=>'';
  obj.v157LongshotHint=()=>'';
  obj.v151ActionFacts=()=>'';
  obj.v153Icon=()=>'<i></i>';
  obj.v151StoryTag=()=>'';
  return obj;
};

check('① 물딜 1.5스턴 — 항상 필수 + 마지막 순서(fillLast), 마딜 완화는 유지',()=>{
  const base={main:1,stun:.5,slow:102,triggerSlow:0,armor:180,triggerArmor:0,boss:2,frenzy:2,single:0,end:0,toki:0,singleEndExpected:0};
  const physical=C.clearProfileDetails(base,'physical',{gorosei:'none'});
  const row=physical.requirements.find(r=>r.key==='stunFull');
  assert.strictEqual(row.required,true,'물딜 1.5스턴은 이감이 차도 필수다(v19.9)');
  assert.strictEqual(row.meta&&row.meta.fillLast,true,'fillLast 표식이 없다');
  assert(!('relaxedBySlow' in (row.meta||{})),'물딜에 v18.9 완화 표식이 남아 있다');
  const dual=C.clearProfileDetails(Object.assign({},base,{main:2}),'magic',{gorosei:'none',magicRoute:'dual',_resolvedMagicRoute:'dual'});
  const mrow=dual.requirements.find(r=>r.key==='stunFull');
  // v19.9.7(0802 패배 포렌식 "스턴이 새서"): 마딜의 v18.9 완화(이감 충족 시
  // 해제)는 46라 이감 충족 → 스턴 결손 소멸 → 0.51 스턴 단끝 전멸을 만들었다.
  // 물딜과 같은 계약으로 교정: 항상 필수, 순서만 최후(fillLast).
  assert.strictEqual(mrow.required,true,'마딜 1.5스턴은 이감이 차도 필수다(v19.9.7 · 0802 교정)');
  assert.strictEqual(mrow.meta&&mrow.meta.fillLast,true,'마딜 stunFull 에 fillLast 표식이 없다');
  assert(!('relaxedBySlow' in (mrow.meta||{})),'마딜에 v18.9 완화 표식이 남아 있다');
  // 정책: 보스 창(55라)에서도 물딜 stunFull 그룹은 열린 방깎·이감 위로
  // 올라올 수 없다 — 예전에는 BOSS_POWER 부양이 stunFull 을 앞세웠다.
  const rows=[
    {key:'main',label:'상위',current:1,target:1,gap:0,required:true},
    {key:'armor',label:'상시 방깎',current:150,target:180,gap:30,required:true},
    {key:'stunBase',label:'0.7스턴',current:.7,target:.7,gap:0,required:true},
    {key:'slow',label:'이감',current:90,target:102,gap:12,required:true},
    {key:'bossFrenzy',label:'광보잡',current:2,target:2,gap:0,required:true},
    // v19.9.7: fillLast 는 코어 행 meta 가 진실이다(물딜 전용 게이트 폐지) —
    // 실제 코어 행과 같게 meta 를 싣는다.
    {key:'stunFull',label:'1.5스턴',current:.5,target:1.5,gap:1,required:true,meta:{lastPriority:true,fillLast:true}}
  ];
  const groups=P._test.groupRows(P.ROUTES.physical,{deficits:{requirements:rows}},P.checkpointFor(55),55);
  const sfIndex=groups.findIndex(group=>group.keys.includes('stunFull'));
  assert.strictEqual(sfIndex,groups.length-1,`물딜 1.5스턴 그룹이 마지막이 아니다 (index ${sfIndex}/${groups.length-1})`);
});

check('② 제작 카드 — TMO% · 직접 조합식 · 노리기 카드 % 숨김',()=>{
  const craft=app.slice(app.indexOf('renderV153CraftableLegends(state,plan){'),app.indexOf('renderV153UnusedRare(state,plan){'));
  // v20.5: 사용자 결정으로 카드의 큰 %(완성도) 자체가 철거됐다 —
  // "티모 %이제 필요없잖아 없애줘".  1라 빈 패에서 모든 칸이 0% 였다.
  // 카드가 말하는 진행도는 이제 희귀 보유 비율과 남은 흔함 장수뿐이다.
  assert(!craft.includes('v156-ratio'),'완성도 % 배지가 남아 있음');
  assert(craft.includes("<strong>희귀 ${owned}/${total}</strong>"),'희귀 보유 비율이 사라짐');
  assert(craft.includes('v159-recipe'),'직접 조합식 라인이 없다');
  assert(craft.includes('solve.direct'),'조합식이 direct stuffs 기반이 아니다');
  assert(craft.includes('흔함 ${C.num(progress.short)}장 남음'),'푸터에 남은 흔함 장수가 없다');
  assert(css.includes('.v159-recipe'),'조합식 스타일이 없다');
});

check('③ 승인 카드 스킵 경고 — 같은 승인이 다음 라운드에도 남으면 마감 역산(런타임)',()=>{
  assert(app.includes('v159-skip-warn'),'스킵 경고 마크업 없음');
  assert(css.includes('.v159-skip-warn'),'스킵 경고 스타일 없음');
  const obj=stubApp();
  const state=C.normalizeState(context.ORD_TMO_UNITS,{counts:{},units:[]},{});
  const decision={state:'ACT_NOW',label:'레베카 제작',reason:'방깎 승인',assessment:{checkpoint:{label:'중간 전력 마감',dueRound:40}},action:{id:'190H',name:'레베카',wispCost:0,wispAfter:5,unit:null,quote:{wisp:{cost:0},solve:{rareUse:{},direct:[],lowestMissing:{}}},deltas:[]}};
  const pack={v15Decision:decision,postLegendDecision:{awaiting:false}};
  const first=obj.renderV151NextAction(state,pack,{ready:true});
  assert(!first.includes('v159-skip-warn'),'승인 첫 라운드부터 경고가 뜸');
  obj.actualRound=()=>21;
  const held=obj.renderV151NextAction(state,pack,{ready:true});
  assert(held.includes('v159-skip-warn'),'2라운드 뒤에도 경고가 안 뜸');
  assert(held.includes('3라운드째'),'유지 라운드 수 역산이 틀림');
  assert(held.includes('40라'),'마감 역산(체크포인트 마감)이 없음');
  // 다른 카드로 바뀌면 추적이 초기화된다.
  decision.action=Object.assign({},decision.action,{id:'830h',name:'다른 카드'});
  const switched=obj.renderV151NextAction(state,pack,{ready:true});
  assert(!switched.includes('v159-skip-warn'),'카드가 바뀌었는데 경고가 남음');
});

check('④ 유일 마감 수단 조기 적립 경고 — 후보 1개 + 선위 부족 >8(런타임)',()=>{
  assert(app.includes('v159-single-closer'),'유일 수단 경고 마크업 없음');
  assert(css.includes('.v159-single-closer'),'유일 수단 경고 스타일 없음');
  const obj=stubApp();
  const lone={recovery:{note:'',targets:[{id:'U30h',name:'레드포스호',roleKey:'bossFrenzy',roleLabel:'광보잡',wispCost:26,wispGap:18,missing:[]}]}};
  const html=obj.renderV151Recovery(lone,'HOLD');
  assert(html.includes('v159-single-closer'),'유일 수단인데 경고가 안 뜸');
  assert(html.includes('레드포스호'),'경고에 유닛 이름이 없음');
  const pair={recovery:{note:'',targets:[
    {id:'U30h',name:'레드포스호',roleKey:'bossFrenzy',roleLabel:'광보잡',wispCost:26,wispGap:18,missing:[]},
    {id:'P10h',name:'아카이누',roleKey:'bossFrenzy',roleLabel:'광보잡',wispCost:4,wispGap:0,missing:[]}
  ]}};
  assert(!obj.renderV151Recovery(pair,'HOLD').includes('v159-single-closer'),'대안이 둘인데도 경고가 뜸');
  const cheap={recovery:{note:'',targets:[{id:'U30h',name:'레드포스호',roleKey:'bossFrenzy',roleLabel:'광보잡',wispCost:6,wispGap:2,missing:[]}]}};
  assert(!obj.renderV151Recovery(cheap,'HOLD').includes('v159-single-closer'),'선위 부족이 작은데도 경고가 뜸');
});

check('⑤ 비추천 수동 제작 감지 — 소스 계약(모비딕호 케이스)',()=>{
  assert(app.includes('unrecommended-manual-craft'),'감사 기록 액션 없음');
  assert(app.includes('수동 제작 감지'),'경고 문구 없음');
  assert(app.includes('_v199MarkedIds'),'제작함 버튼 경유 제외가 없음');
  assert(app.includes('_v199RecommendedIds'),'추천 카드 제외가 없음');
  // 추천 이행 경로 3곳(카드·큐·회복 목표)이 전부 추천 목록에 기록돼야 한다.
  assert((app.match(/_v199RecommendedIds/g)||[]).length>=4,'추천 기록 지점이 부족하다');
});

check('⑥ 이감 구성 분해 — 유닛별·연구소·발동(런타임)',()=>{
  assert(app.includes('v199SlowSplit'),'분해 헬퍼 없음');
  assert(app.includes('v159-slow-split'),'분해 표시 마크업 없음');
  const obj=stubApp();
  obj.state.labResearch={slow:true};
  const bare=C.normalizeState(context.ORD_TMO_UNITS,{counts:{},units:[]},{});
  const slowUnit=bare.db.units.find(unit=>C.num(C.roleProfile(unit).slow)>=20);
  assert(slowUnit,'픽스처 전제: 이감 20+ 유닛이 카탈로그에 있어야 함');
  const state=C.normalizeState(context.ORD_TMO_UNITS,{counts:{[slowUnit.id]:1},units:[]},{});
  const text=obj.v199SlowSplit(state);
  assert(text.includes('이감 구성'),'분해 라벨 없음');
  assert(text.includes('연구소 10'),'연구소 가산이 분해에 없음');
});

check('⑦ 새 게임 시 연구소 재확인 유도',()=>{
  assert(app.includes('lab-research-recheck-prompt'),'재확인 감사 기록 없음');
  assert(app.includes('실제로 샀는지'),'재확인 문구 없음');
});

check('⑧ 판 종료 침묵 배너 — 50라+ 3분 무변화(런타임)',()=>{
  assert(app.includes('v199GameEndFreezeSec'),'침묵 감지 헬퍼 없음');
  assert(app.includes('v159-endgame'),'배너 마크업 없음');
  assert(css.includes('.v159-endgame'),'배너 스타일 없음');
  const obj=stubApp();
  obj.actualRound=()=>55;
  obj._runResultOpen=false;
  obj.runLogActive=()=>true;
  obj.state.snapshot={dataChangedAt:Date.now()-200000};
  assert(obj.v199GameEndFreezeSec()>0,'3분 무변화인데 감지 안 됨');
  obj.state.snapshot={dataChangedAt:Date.now()-30000};
  assert.strictEqual(obj.v199GameEndFreezeSec(),0,'30초 무변화에 오탐');
  obj.state.snapshot={dataChangedAt:Date.now()-200000};
  obj.actualRound=()=>30;
  assert.strictEqual(obj.v199GameEndFreezeSec(),0,'50라 전에 오탐');
});

console.log(`\n${checks}/${checks} v19.9 batch checks passed.`);
