'use strict';
// v19.9.2 계약 — 0801 패배(보잡 부족) 대응 2건.
//
// ① "지금 할 일에도 조합식" (사용자 요청): 소비 보류(HOLD) 상태의 지금 할
//    일은 회복 목표만 보인다 — 목표마다 직접 조합식(능력치 주석 없이)을
//    함께 단다.  부족: 줄(모을 재료)과 조합· 줄(최종 공식)은 역할이 다르다.
// ② 여유 0 표시: 광보잡·토키 같은 기 수 역할이 정확히 목표치면 지금까지
//    화면은 "충족"만 보였다 — 0801 패배는 광보잡 1(네코 번들 의존)로 죽었고
//    (사용자 진단 "보잡이 부족했"), 클리어 두 판은 광보잡 2·1 이었다.
//    하드 게이트는 표본(1기 1승1패)상 올리지 않는다 — 여유 0만 명시한다.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const app=read('ord_app.js'),css=read('ord_cockpit_v15.css');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

check('① 회복 목표 행마다 조합식이 붙는다(런타임)',()=>{
  assert(app.includes('renderV151Recovery(decision,status,state)'),'상태 전달 시그니처 없음');
  assert(app.includes("renderV151Recovery(decision,'HOLD',state)"),'잠금 분기 호출이 state 를 안 넘김');
  assert(app.includes('renderV151Recovery(decision,status,state)}${this.v157SecondUpperCallout')||app.includes('this.renderV151Recovery(decision,status,state)'),'본 분기 호출이 state 를 안 넘김');
  assert(css.includes('.v151-recovery-row .v159-recovery-recipe'),'조합식 스타일 없음');
  const context={console};context.window=context;vm.createContext(context);
  context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
    vm.runInContext(read(file),context,{filename:file});
  }
  const App=context.ORDApp.App,C=context.ORDCore;
  const obj=Object.create(App.prototype);
  obj.v153Icon=()=>'<i></i>';
  obj._v199RecommendedIds=new Map();
  const state=C.normalizeState(context.ORD_TMO_UNITS,{counts:{},units:[]},{});
  const target=state.db.units.find(unit=>C.isLegendish(unit)&&Array.isArray(unit.stuffs)&&unit.stuffs.length>=2);
  assert(target,'픽스처 전제: 직접 조합식이 있는 전설급이 있어야 함');
  const decision={recovery:{note:'',targets:[{id:target.id,name:'목표',roleKey:'bossFrenzy',roleLabel:'광보잡',wispCost:5,wispGap:0,missing:[]}]}};
  const html=obj.renderV151Recovery(decision,'HOLD',state);
  assert(html.includes('v159-recovery-recipe'),'회복 목표에 조합식이 없다');
  assert(html.includes('조합 ·'),'조합 라벨이 없다');
  // 조합식 조각에는 능력치 괄호 주석이 없어야 한다("(D)드래곤"류 본명 제외).
  const recipe=html.slice(html.indexOf('v159-recovery-recipe'));
  assert(!/[가-힣A-Za-z0-9]\s+\([^)]*(?:스턴|이감|깍|마젠|공증|공속)[^)]*\)/.test(recipe),'조합식에 능력치 주석이 남아 있다');
  // state 없이 불러도(구 시그니처) 조용히 조합식만 생략한다.
  const bare=obj.renderV151Recovery(decision,'HOLD');
  assert(bare.includes('v151-recovery-row')&&!bare.includes('v159-recovery-recipe'),'state 없는 호출 폴백이 깨졌다');
});

check('② 광보잡·토키 여유 0 표시(소스 계약)',()=>{
  assert(app.includes('v159-snug'),'여유 0 마크업 없음');
  assert(app.includes('여유 0 — 한 기 잃으면 열립니다'),'여유 0 문구 없음');
  assert(app.includes("['bossFrenzy','toki'].includes(row.key)"),'대상 역할 제한 없음');
  assert(css.includes('.v153-role b small.v159-snug'),'여유 0 스타일 없음');
});

check('③ 네코마무시(Z90h) 보잡·광폭은 마딜에서 세지 않는다(데이터팩 교차검증·런타임)',()=>{
  // 사용자 데이터팩 legendary_support_index: 네코마무시 roles.magic=[] —
  // 0801 단끝 패배(네코 단독 광보잡 의존)가 실전 근거다.  물딜은 그대로.
  const context={console};context.window=context;vm.createContext(context);
  for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js']){
    vm.runInContext(read(file),context,{filename:file});
  }
  const C=context.ORDCore;
  const neko=context.ORD_TMO_UNITS.find(u=>u.id==='Z90h');
  assert(neko&&C.roleProfile(neko).boss&&C.roleProfile(neko).frenzy,'픽스처 전제: 네코 원 데이터는 보잡·광폭 보유');
  const magic=C.roleContribution(neko,'magic'),physical=C.roleContribution(neko,'physical');
  assert.deepStrictEqual([magic.boss,magic.frenzy,magic.bossFrenzy],[0,0,0],'마딜 기여도에서 네코 보잡이 남아 있다');
  assert.deepStrictEqual([physical.boss,physical.frenzy,physical.bossFrenzy],[1,1,1],'물딜 크레딧이 사라졌다');
  const state=C.normalizeState(context.ORD_TMO_UNITS,{counts:{Z90h:1},units:[]},{});
  const magicSpec=C.currentSpec(state,'magic',{}),physicalSpec=C.currentSpec(state,'physical',{});
  assert.strictEqual(C.num(magicSpec.bossFrenzy),0,'마딜 역할표에서 네코 광보잡이 남아 있다');
  assert.strictEqual(C.num(physicalSpec.bossFrenzy),1,'물딜 역할표 크레딧이 사라졌다');
  // 다른 광보잡 유닛(아카이누 히든 등)은 마딜에서도 그대로 세야 한다 —
  // 0801 클리어 보드의 광보잡 마감이 이 크레딧이었다.
  const other=context.ORD_TMO_UNITS.find(u=>u.id!=='Z90h'&&C.roleProfile(u).boss&&C.roleProfile(u).frenzy&&C.isLegendish(u));
  assert(other,'픽스처 전제: 다른 광보잡 전설급이 있어야 함');
  const otherMagic=C.roleContribution(other,'magic');
  assert.deepStrictEqual([otherMagic.boss,otherMagic.frenzy],[1,1],'네코 외 유닛까지 마딜 제외가 번졌다');
});

console.log(`\n${checks}/${checks} v19.9.2 recovery/redundancy checks passed.`);
