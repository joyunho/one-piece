'use strict';

// v18: 버전 리터럴을 테스트에 박아 두면 릴리스마다 여기서 먼저 깨진다
// (v17.20·v17.22·v18에서 세 번 반복됐다).  package.json 을 단일
// 원천으로 읽어 '모듈들이 서로 같은 버전인가'만 검사한다.
const RELEASE_VERSION=require('../package.json').version;

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of [
  'ord_story_nonupper_data.js','ord_story_upper_data.js','ord_units_data.js',
  'ord_data_patch.js','ord_core.js','ord_v15_model.js','ord_v15_ledger.js',
  'ord_v15_policy.js','ord_v15_engine.js'
])require(path.join(EXT,file));

const C=global.ORDCore,M=global.ORDV15Model,L=global.ORDV15Ledger,
  P=global.ORDV15Policy,E=global.ORDV15Engine;

const wisp={id:C.WISP_ID,name:'선택위습',groupName:'특수재료',abilities:{},stuffs:[]};
const common={id:'v15-common',name:'테스트 흔함',groupName:'흔함',abilities:{},stuffs:[]};
const rareA={id:'v15-rare-a',name:'첫 희귀 A',groupName:'희귀함',abilities:{},stuffs:[{id:C.WISP_ID,count:3}]};
const rareB={id:'v15-rare-b',name:'첫 희귀 B',groupName:'희귀함',abilities:{},stuffs:[{id:C.WISP_ID,count:1}]};
const legendA={id:'v15-legend-a',name:'첫 전설 A',groupName:'전설 [물딜]',abilities:{'방어력 감소':20},stuffs:[{id:rareA.id,count:1}]};
const legendB={id:'v15-legend-b',name:'추가 전설 B',groupName:'히든 [물딜]',abilities:{'이동속도 감소':20},stuffs:[{id:C.WISP_ID,count:1}]};
const upperA={id:'v15-upper-a',name:'메인 상위 A',groupName:'초월 [물딜]',abilities:{'방어력 감소':50},stuffs:[{id:C.WISP_ID,count:1}]};
const orphanRare={id:'v15-orphan-rare',name:'근거 없는 희귀',groupName:'희귀함',abilities:{},stuffs:[]};
const orphanConsumer={id:'v15-orphan-consumer',name:'근거 없는 소비자',groupName:'전설 [물딜]',abilities:{},stuffs:[{id:orphanRare.id,count:1}]};
const zombie={id:'unit_1767884889420_456',name:'좀비',groupName:'특수재료',abilities:{},stuffs:[]};
const absalom={id:'v15-absalom',name:'압살롬',groupName:'전설 [물딜]',abilities:{},stuffs:[{id:zombie.id,count:1}]};
const superKuma={id:C.SUPER_KUMA_ID,name:'초월쿠마',groupName:'특수재료',hardSpecial:true,abilities:{},stuffs:[]};
const transcend={id:'v15-transcend',name:'테스트 초월',groupName:'초월 [물딜]',abilities:{'방어력 감소':40},stuffs:[{id:superKuma.id,count:1}]};
const catalog=[wisp,common,rareA,rareB,legendA,legendB,upperA,orphanRare,orphanConsumer,zombie,absalom,superKuma,transcend];

function input({counts={},percent={},settings={},abilities={}}={}){
  const rows=catalog.map(unit=>Object.assign({},unit,{count:Number(counts[unit.id]||0),tmoPercent:Number(percent[unit.id]||0)}));
  return{catalog,snapshot:{source:'fixture',sessionId:'v15-test',seq:1,at:1000,dataChangedAt:1000,wispCountFound:true,wispCount:Number(counts[C.WISP_ID]||0),counts:Object.assign({},counts),currentAbilities:abilities,units:rows},settings:Object.assign({currentRound:25,mode:'physical',magicRoute:'physical',postLegendRoute:'',manualCounts:{},superKumaOwned:false,wispOverride:'',virtualSpecialId:'',gorosei:'none'},settings),locks:[]};
}

assert.strictEqual(M.VERSION,RELEASE_VERSION);
assert.strictEqual(L.VERSION,RELEASE_VERSION);
assert.strictEqual(P.VERSION,RELEASE_VERSION);
assert.strictEqual(E.AUTHORITY,'ord-v15-decision-engine');

// Observed TMO counts remain immutable evidence; user corrections live only in
// the effective scenario and are recorded as assumptions.
{
  const model=M.build(input({counts:{[common.id]:1,[C.WISP_ID]:2},settings:{manualCounts:{[common.id]:4}}}));
  assert.strictEqual(model.observed.counts[common.id],1);
  assert.strictEqual(model.effective.counts[common.id],4);
  assert(model.patch.assumptions.some(row=>row.kind==='manual-count'&&row.id===common.id));
  const changed=M.build(input({counts:{[common.id]:1,[C.WISP_ID]:2},percent:{[rareA.id]:90}}));
  const changedAgain=M.build(input({counts:{[common.id]:1,[C.WISP_ID]:2},percent:{[rareA.id]:91}}));
  assert.notStrictEqual(changed.fingerprint,changedAgain.fingerprint,'completion-only TMO change reused an old authority fingerprint');
}

// First milestones remain completion-authority rules after their nominal
// deadlines. PREPARE is not an executable action.
{
  // v21.3(사용자: "희귀랑 전설or히든은 제일 빠르게 만들 수 있는 걸로"):
  // 첫 픽 1순위는 속도다.  선위 1 부족(완성도 80%)이 선위 3 부족(99%)을
  // 이긴다 — 완성도는 같은 속도끼리의 타이브레이크로 내려갔다.
  const prepare=E.decide(input({counts:{[C.WISP_ID]:0},percent:{[rareA.id]:99,[rareB.id]:80},settings:{currentRound:12}}));
  assert.strictEqual(prepare.state,'PREPARE');
  assert.strictEqual(prepare.action,null);
  assert.strictEqual(prepare.blockedAction.id,rareB.id);
  assert.strictEqual(prepare.authorityEngine,E.AUTHORITY);

  const firstLegend=E.decide(input({counts:{[rareA.id]:1,[C.WISP_ID]:2},percent:{[legendA.id]:96,[legendB.id]:90},settings:{currentRound:23}}));
  assert.strictEqual(firstLegend.state,'ACT_NOW');
  assert.strictEqual(firstLegend.action.id,legendA.id);
  assert.match(firstLegend.label,/첫 전설/);
}

// Explicit post-legend "legend" choice must remain a completion decision and
// must not recommend the already-owned highest-completion legend again.
{
  const more=E.decide(input({counts:{[legendA.id]:1,[C.WISP_ID]:2},percent:{[legendA.id]:100,[legendB.id]:93},settings:{currentRound:25,postLegendRoute:'legend'}}));
  assert.strictEqual(more.state,'ACT_NOW');
  assert.strictEqual(more.action.id,legendB.id);
  assert.match(more.label,/추가 전설/);

  // v21.0(전면 재설계): 방향 미선택은 더는 침묵(ROUTE_CHOICE)이 아니다.
  // 0806a 실측에서 이 대기 상태가 32라운드를 삼켰고, 사용자가 "전면
  // 재설계"로 뒤집었다.  엔진이 후보 1위 방향을 스스로 채택해 추천을
  // 이어가고, 채택 사실은 routeAuto 로 실린다.  이 합성 픽스처에는 만들
  // 것이 없으므로 행동이 비어 있을 수는 있지만, "사용자가 고를 때까지
  // 멈춘다"는 상태 자체가 다시 나타나면 회귀다.
  const choose=E.decide(input({counts:{[legendA.id]:1,[C.WISP_ID]:2},percent:{[legendA.id]:100,[legendB.id]:93},settings:{currentRound:25,postLegendRoute:''}}));
  assert.notStrictEqual(choose.state,'ROUTE_CHOICE');
  assert(choose.routeAuto,'자동 채택 사실(routeAuto)이 판단에 실리지 않음');
  assert(Array.isArray(choose.routeCandidates),'방향판 후보가 판단에서 사라짐');
}

// Exact ledger rejects non-Common leaf shortages and stale sequential quotes.
{
  const model=M.build(input({counts:{[C.WISP_ID]:99}}));
  const blocked=L.quote(model,orphanConsumer,model.effective.counts);
  assert.strictEqual(blocked.feasible,false);
  assert(blocked.blocked.some(reason=>/조합 근거 부족/.test(reason)),blocked.blocked);
  const ready=L.quote(model,legendB,model.effective.counts);
  assert.strictEqual(ready.feasible,true);
  const stale=Object.assign({},model.effective.counts,{[common.id]:1});
  assert.strictEqual(L.apply(model,ready,stale).ok,false);
}

// Absalom is the sole special-prerequisite exception: the zombie leaf may be
// absent without turning an otherwise exact recipe into a false block.
{
  const model=M.build(input({counts:{[C.WISP_ID]:0}})),quote=L.quote(model,absalom,model.effective.counts);
  assert.strictEqual(quote.prerequisite.exception,true);
  assert.strictEqual(quote.feasible,true,quote.blocked);
  assert.strictEqual(L.apply(model,quote,model.effective.counts).ok,true);
}

// v16.5: 초월쿠마 is obtainable at will until the single transcend is spent —
// the '초월 가능' toggle asserts that game rule, so one Kuma is assumed and
// transcend uppers stay comparable in the route choice.  '소진' removes it.
// Other special prerequisites (레일리 등) must still be observed.
{
  const assumed=M.build(input({counts:{[C.WISP_ID]:0},settings:{superKumaOwned:true}}));
  assert.strictEqual(assumed.effective.counts[C.SUPER_KUMA_ID]||0,1,'transcend availability must assume one Kuma');
  assert(assumed.patch.assumptions.some(row=>row.kind==='transcend-available'),'the assumed Kuma must be a recorded assumption');
  assert.strictEqual(L.quote(assumed,transcend,assumed.effective.counts).prerequisite.allowed,true);
  const spent=M.build(input({counts:{[C.SUPER_KUMA_ID]:1,[C.WISP_ID]:0},settings:{superKumaOwned:false}}));
  assert.strictEqual(spent.effective.counts[C.SUPER_KUMA_ID]||0,0,'spent transcend must remove the Kuma');
  const blocked=L.quote(spent,transcend,spent.effective.counts);
  assert.strictEqual(blocked.feasible,false);
  assert(blocked.blocked.some(reason=>/초월쿠마 필요/.test(reason)),blocked.blocked);
}

// Policy never upgrades a structural role sheet into a measured clear claim.
{
  const model=M.build(input({counts:{[legendA.id]:1,[upperA.id]:1,[C.WISP_ID]:0},settings:{currentRound:50}}));
  const assessment=P.evaluate(model,model.effective.counts,P.ROUTES.physical,{round:50,locks:[{stage:'upper',id:upperA.id}]});
  assert.notStrictEqual(assessment.status,'verified');
  assert.strictEqual(assessment.evidence.combat,'unmeasured');
  assert(assessment.unknowns.some(text=>/보스 DPS/.test(text)));
}

console.log('PASS v15 model keeps observed evidence separate from scenario patches');
console.log('PASS v15 exact ledger blocks unproved leaves and preserves Absalom exception');
console.log('PASS v15 single authority handles first/additional completion milestones');
console.log('PASS v15 policy never claims unmeasured combat verification');
