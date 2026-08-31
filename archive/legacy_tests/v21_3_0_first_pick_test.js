'use strict';
// v21.3.0 계약 — 첫 실전(v21.2) 피드백 세 건.
//
//  ① "압살롬 뽑기가 막혀있어서 … 특정한 재료가 필요한 애들은 추천을
//     생각해서 해줘(내 패에 그게 있는지 확인)" — 희귀 페로나(이감20)는
//     압살롬×1이 필요하고 압살롬은 좀비×3(후반 재료)으로만 제작되는데,
//     원장의 압살롬 예외가 빈 패에서도 feasible=true 를 내는 바람에
//     1라 1순위로 올라갔다.  순위에서 hardMissing 후보를 강등한다.
//  ② "희귀랑 전설or히든은 제일 빠르게 만들 수 있는 걸로 나오고 그
//     뒤에는 패를 보고 가면 좋아" — 첫 픽은 속도 우선, 추가 전설은
//     가치 우선(v17.7 계약 유지).
//  ③ "자동으로 바꿀려 했는데 강제로 물딜로 고정됐었어" — TMO 감지 잠금이
//     매 스냅샷 mode 를 상위 계통으로 되돌려 썼다.  명시적 '자동'이 이긴다.
const assert=require('assert'),fs=require('fs'),path=require('path');
const lib=require('./lib/ordlog_replay.js');
const ROOT=path.join(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

const engine=lib.loadEngine();
const C=global.ORDCore,cat=global.ORD_TMO_UNITS;
const mk=(counts,wisp)=>({catalog:cat,snapshot:{source:'v213',counts:Object.assign({[C.WISP_ID]:wisp},counts),wispCountFound:true,wispCount:wisp,currentAbilities:{}},settings:{currentRound:2,mode:'physical',magicRoute:'auto',manualCounts:{}},locks:[]});
const peronaRare=cat.find(u=>/^페로나/.test(u.name||'')&&/희귀/.test(u.groupName||''));
const absalom=cat.find(u=>/^압살롬/.test(u.name||''));

check('① 뽑기·드랍 전용 재료 미보유 후보는 첫 픽이 아니다',()=>{
  assert(peronaRare&&absalom,'픽스처 유닛 소실');
  const empty=engine.decide(mk({},12)),pick=empty.action||empty.blockedAction;
  assert(pick,'첫 희귀 픽이 비었다');
  assert.notStrictEqual(pick.id,peronaRare.id,'빈 패에서 압살롬 필요 희귀를 또 1순위로 올림');
  // 원장의 압살롬 예외(제작 증명 쪽)는 건드리지 않는다 — 순위만 강등.
  assert(fs.readFileSync(path.join(EXT,'ord_v15_engine.js'),'utf8').includes('hardShort'),'hardMissing 강등 배선 소실');
  assert.strictEqual(empty.evidence.rankingAuthority,'fastest-first-usage-tiebreak');
});

check('① 재료가 실제 패에 있으면 정상 순위로 복귀한다',()=>{
  // v21.4 갱신: 전략 구상 ①(스토리 S급 +2선위 투자)이 이 위에 얹혔다.
  // 계약의 알맹이는 "압살롬이 패에 있으면 페로나가 차단에서 풀린다"이지
  // 무조건 1위가 아니다 — S급 프리미엄 픽이 있으면 그쪽이 이기고,
  // 페로나는 정상 후보(1위 또는 대안)로 보이면 된다.
  const withAbs=engine.decide(mk({[absalom.id]:1},12)),pick=withAbs.action||withAbs.blockedAction;
  const premium=withAbs.evidence&&withAbs.evidence.storyPremium;
  const inContention=pick&&pick.id===peronaRare.id
    ||(withAbs.alternatives||[]).some(alt=>alt.id===peronaRare.id);
  assert(inContention,`압살롬 보유 패에서 페로나가 후보권 밖: 픽=${pick&&pick.name}, 대안=${(withAbs.alternatives||[]).map(a=>a.name).join(',')}`);
  if(pick&&pick.id!==peronaRare.id)
    assert(premium&&/^S/.test(premium.tier),`페로나를 밀어낸 것이 S급 프리미엄이 아님: ${pick.name}`);
});

check('② 첫 픽은 속도 우선 — 부족 선위가 적은 쪽이 완성도를 이긴다',()=>{
  const src=fs.readFileSync(path.join(EXT,'ord_v15_engine.js'),'utf8');
  assert(src.includes("milestoneSpec.key!=='additionalFinal'"),'첫 픽/추가 전설 분기 소실');
  // 추가 전설은 가치 우선 유지 — v17.7 "마감 없이 최고 완성" 계약의 근거.
  assert(/additionalFinal[\s\S]{0,400}b\.usage-a\.usage\|\|b\.completion-a\.completion/.test(src)||src.includes(":(b.usage-a.usage||b.completion-a.completion"),'추가 전설 가치 우선 소실');
});

check('③ 명시적 자동 선택은 TMO 감지 잠금에 덮이지 않는다',()=>{
  const appSrc=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(appSrc.includes("this.state.modeExplicit===true&&!this.state.mode)return false"),'자동 우선 가드 소실');
  // 런타임 재현: 물딜 상위가 잠긴 상태에서 mode=''(자동, 명시)이면
  // syncUpperMode 가 mode 를 되돌려 쓰지 않는다.
  global.localStorage=global.localStorage||{getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  require(path.join(EXT,'ord_app.js'));
  const App=global.ORDApp.App;
  const physUpper=cat.find(u=>C.isUpper(u)&&C.familyOf(u)==='physical');
  assert(physUpper,'물딜 상위 픽스처 없음');
  const app=Object.create(App.prototype);
  const db={byId:new Map(cat.map(u=>[u.id,u]))};
  app.state={mode:'',modeExplicit:true,magicRoute:'auto'};
  const changed=app.syncUpperMode(physUpper.id,db);
  assert.strictEqual(changed,false,'자동 상태를 바꿨다고 보고');
  assert.strictEqual(app.state.mode,'','자동(mode="")이 상위 계통으로 강제 복원됨 — 실전 버그 재발');
  // 명시 선택이 아니면(감지 직후 기본 동작) 기존대로 계통을 따라간다.
  app.state={mode:'',modeExplicit:false,magicRoute:'auto'};
  app.syncUpperMode(physUpper.id,db);
  assert.strictEqual(app.state.mode,'physical','암묵 상태의 계통 동기화까지 꺼짐 — 과교정');
});

console.log(`\n${checks} checks passed (v21.3.0 — 첫 픽 속도·재료 현실·자동 우선)`);
