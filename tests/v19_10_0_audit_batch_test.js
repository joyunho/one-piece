'use strict';
// v19.10.0 계약 — 외부 점검 대응 2차 배치.
//
// ① P0-2 희귀 기회 원장: 목적지({unitId,unitName,count,source}) 보존 +
//    "제작 후보 ∩ 리롤 = ∅" — 화면 한쪽이 만들 수 있다는 희귀를 다른쪽이
//    리롤하라고 말하는 모순을 원장에서 차단한다.
// ② 4-4 상위 슬롯 규칙 단일화: C.upperSlotLimit 하나를 플래너·실행 엔진이
//    같이 소비한다(물딜 두 번째 상위 확정 시 양쪽 다 2).
// ③ 4-2 티어 무관 각 프로브: S/A 가 probe 를 독식해 저티어 완벽각이
//    정밀 평가 전에 잘리던 컷에 티어 무시 1슬롯을 예약.
// ④ UI: 노리기 구역 분리(8-1)·희귀 막대=보유 비율(8-2)·큐 가변 표기(8-4)
//    ·1위/2위 차이(4-3)·1366 축소 완화(8-5)·nettap 샘플링(9-4).
// ⑤ §11 개인정보: 원시 랭킹 데이터에 실명 닉네임·원 userId 잔존 금지.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),zlib=require('zlib');
const ROOT=path.join(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(EXT,file),'utf8');
const app=read('ord_app.js'),engine=read('ord_v15_engine.js'),planner=read('ord_squad_planner.js'),css=read('ord_cockpit_v15.css'),nettap=read('ord_page_nettap.js');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

const context={console,setTimeout,clearTimeout};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,App=context.ORDApp.App,units=context.ORD_TMO_UNITS;

const stubApp=(mode,round,rerolls)=>{
  const obj=Object.create(App.prototype);
  obj.state={mode:mode||'physical',locks:[],rerollsUsed:rerolls||0,pendingTransaction:null,secondUpperId:''};
  obj.actualRound=()=>round||30;
  obj.upperLock=()=>null;
  obj.v151ShipPlan=()=>({legendRows:[],recommendedId:''});
  return obj;
};

(async()=>{
check('① 원장 — 제작 가능 희귀는 리롤 후보에서 빠지고 목적지가 보존된다(런타임)',()=>{
  // 부유한 패: 흔함·안흔·특별 충분 + 희귀 몇 종 — 일부 희귀는 즉시 제작
  // 가능한 전설의 재료가 된다.
  const counts={'810e':40};
  for(const u of units){if(C.isCommon(u))counts[u.id]=14;else if(C.isUncommon(u))counts[u.id]=7;else if(C.isSpecialTier(u))counts[u.id]=4;}
  const db=C.buildDb(units);
  for(const rare of db.rares.slice(0,8))counts[rare.id]=1;
  const state=C.normalizeState(units,{counts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});
  const obj=stubApp('physical',30,0);
  const decision=obj.v151ProtectRareDecision({state:'HOLD',action:null,rare:{rows:[]}},{rareAllocation:[],timelineReadiness:null},state);
  const rows=decision.rare.rows;
  assert(rows.length>=4,`희귀 행이 ${rows.length}개뿐`);
  // 즉시 제작 가능 그룹(원장의 craftable 소스와 같은 계산)과 리롤의 교집합 검사.
  const craftReadyIds=new Set();
  for(const group of C.rareCraftableLegends(state,{maxPerRare:8})||[]){
    if((group.rows||[]).some(row=>row.ready&&!row.blocked))craftReadyIds.add(String(group.id));
  }
  assert(craftReadyIds.size>=1,'픽스처에 즉시 제작 가능 희귀가 없음 — 재료를 더 채워야 함');
  for(const row of rows){
    if(C.num(row.reroll)>0){
      assert(!craftReadyIds.has(String(row.id)),`${row.name}: 제작 후보인데 리롤로 표시 (교집합 계약 위반)`);
      assert.strictEqual((row.destinations||[]).length,0,`${row.name}: 목적지가 있는데 리롤`);
    }
    if(craftReadyIds.has(String(row.id))){
      assert((row.destinations||[]).some(item=>item.source==='craftable'&&item.unitName),`${row.name}: craftable 목적지 누락`);
    }
    assert.strictEqual(row.use+row.hold+row.reroll,row.initial,`${row.name}: 원장 산술 불일치`);
  }
  // 목적지가 전혀 없는 희귀는 여전히 리롤이 배정된다 — 과보호로 리롤
  // 기능 자체가 죽으면 안 된다.  (희귀 하나만, 다른 재료 없음)
  const lonely={'810e':10};
  const lonelyRare=db.rares[0];lonely[lonelyRare.id]=1;
  const lonelyState=C.normalizeState(units,{counts:lonely,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});
  const lonelyDecision=stubApp('physical',30,0).v151ProtectRareDecision({state:'HOLD',action:null,rare:{rows:[]}},{rareAllocation:[],timelineReadiness:null},lonelyState);
  const lonelyRow=lonelyDecision.rare.rows.find(row=>String(row.id)===String(lonelyRare.id));
  assert(lonelyRow,'단독 희귀 행 없음');
  if(!(lonelyRow.destinations||[]).length)assert(C.num(lonelyRow.reroll)>0,'사용처 없는 단독 희귀가 리롤로 배정되지 않음');
});

check('② 상위 슬롯 규칙 — 코어 단일 함수를 플래너·엔진이 공유(4-4)',()=>{
  assert.strictEqual(C.upperSlotLimit('dual',{}),2);
  assert.strictEqual(C.upperSlotLimit('physical',{}),1);
  assert.strictEqual(C.upperSlotLimit('physical',{secondUpperId:'490H'}),2,'물딜 2상위 확정이 슬롯을 안 연다');
  assert.strictEqual(C.upperSlotLimit('singleEnd',{}),1);
  assert(engine.includes('C.upperSlotLimit'),'실행 엔진이 공유 규칙을 안 쓴다');
  assert(planner.includes("C.upperSlotLimit?C.upperSlotLimit('physical'"),'플래너가 공유 규칙을 안 쓴다');
  assert(!engine.includes("maxUpper=route.key==='dual'?2:1;"),'엔진에 옛 하드코딩 잔존');
});

check('③ 각 프로브 — 티어 무관 최고각 1슬롯 예약(4-2)',()=>{
  assert(engine.includes('currentHandAngleBlindCompare'),'티어 무시 비교자가 없음');
  const probes=engine.slice(engine.indexOf('function currentHandAngleProbes'));
  assert(probes.slice(0,900).includes('blindBest'),'프로브가 티어 무시 1위를 예약하지 않음');
  // 티어 비교가 blind 비교자에 섞이면 예약의 의미가 사라진다.
  const blind=engine.slice(engine.indexOf('function currentHandAngleBlindCompare'),engine.indexOf('function currentHandAngleProbes'));
  assert(!blind.includes('tierRank'),'blind 비교자가 티어를 본다');
});

check('④ UI — 노리기 분리·막대 비율·큐 가변·2위 대비·1366·nettap 샘플링',()=>{
  assert(app.includes('v1910-upcoming-head'),'노리기 구역 분리 없음(8-1)');
  assert(app.includes("width:${total>0?Math.round(owned/total*100):0}%"),'희귀 막대가 보유 비율이 아님(8-2)');
  assert(app.includes('v1910-flex'),'큐 가변 표기 없음(8-4)');
  assert(!app.includes('1번(왼쪽 큰 카드)만 확정입니다'),'옛 번호 안내문 잔존');
  assert(app.includes('v1910-runner'),'1위/2위 차이 표시 없음(4-3)');
  assert(css.includes('zoom:.93'),'1366 완화 배율 없음(8-5)');
  // 검증 수리: 추천 카드는 4번째 이후여도 숨기지 않는다.
  assert(css.includes('.v153-craft-cards>button:nth-child(n+4):not(.recommended){display:none}'),'1366 정보량 축소 없음');
  assert(nettap.includes('function sampled(')&&nettap.includes('sampled(url, response.status, text.length)'),'nettap 샘플링 없음(9-4)');
});

check('⑤ 개인정보 — 원시 랭킹 데이터에 식별자 원문 잔존 금지(§11)',()=>{
  assert(fs.existsSync(path.join(ROOT,'tools/anonymize_raw_rankings.js')),'익명화 도구 없음');
  const histories=JSON.parse(fs.readFileSync(path.join(ROOT,'data/tmo_api_histories_20260725.json'),'utf8'));
  for(const player of histories.players||[]){
    assert(/^player-\d{3,}$/.test(String(player.nickname||'')),`histories 실명 잔존: ${player.nickname}`);
  }
  const all=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT,'data/tmo_nightmare_all_20260728.json.gz'))));
  let index=0;
  for(const player of all.players||[]){
    index+=1;
    assert(/^player-\d{3,}$/.test(String(player.nickname||'')),`전수 표본 실명 잔존(#${index})`);
    assert.strictEqual(C.num(player.userId),index,`userId 원문 잔존(#${index})`);
  }
});

console.log(`\n${checks} checks passed (v19.10.0 외부 점검 배치)`);
})().catch(error=>{console.error('FAIL',error&&error.stack||error);process.exit(1);});
