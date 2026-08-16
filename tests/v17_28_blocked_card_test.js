'use strict';

// v17.28 — 사용자 지적 2건.
//
// ① "나에게 필요한 건 내가 보유한 희귀함으로 만들 수 있는 전설급 유닛이야."
//    3번 영역의 `지금 희귀로 만들 수 있음` 목록이 v151BuildableLegendRows를
//    쓰고 있었는데 그 함수는 희귀 소모를 요구하지 않는다.  그래서 화면에
//    "희귀 직접 소모 없음" 항목이 그대로 실렸다(스크린샷 확인).
//
// ② "이 타이밍에 추천을 안 해버리면 굉장히 곤란해진다."
//    최종 파티 정합성 가드가 action·blockedAction을 둘 다 null로 만들어
//    1번 카드가 통째로 비었다.  실측 로그 ORD_2305_20260728_053445에서
//    r38~r52 사이 9개 라운드가 SYNC_BLOCKED였고 r39·r51은 그 라운드 내내
//    이 상태였다.  승인은 계속 막되 무엇을 왜 기다리는지는 보여야 한다.

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js'])require(path.join(EXT,file));

const C=global.ORDCore,E=global.ORDV15Engine,units=global.ORD_TMO_UNITS;
const LOG=path.join(__dirname,'../data/ORD_2305_20260725_120442_active.ordlog.json');
let passed=0;
function test(name,fn){fn();passed+=1;console.log(`PASS ${name}`);}

function stateAt(round){
  const log=JSON.parse(fs.readFileSync(LOG,'utf8'));
  let counts={},abilities={},target=null;
  for(const event of log.events){
    if(event.type!=='snapshot')continue;
    const p=event.payload;
    if(p.kind==='full'){counts=Object.assign({},p.counts||{});abilities=Object.assign({},p.currentAbilities||{});}
    else{
      for(const [k,v] of Object.entries(p.counts||{})){if(v===null)delete counts[k];else counts[k]=v;}
      for(const [k,v] of Object.entries(p.currentAbilities||{})){if(v===null)delete abilities[k];else abilities[k]=v;}
    }
    if(event.round<=round)target={counts:Object.assign({},counts),abilities:Object.assign({},abilities)};
  }
  assert(target,`R${round} 스냅샷 없음`);
  return C.normalizeState(units,{counts:target.counts,currentAbilities:target.abilities},{manualCounts:{},superKumaOwned:true});
}

test('희귀 목록에는 그 희귀를 실제로 쓰는 조합만 실린다',()=>{
  const state=stateAt(35),groups=C.rareCraftableLegends(state,{mode:'physical'});
  const flat=groups.flatMap(group=>group.rows.map(row=>({group,row})));
  assert(flat.length>0,'실전 패인데 목록이 비었다');
  for(const {group,row} of flat){
    const solve=C.recipeSolve(state.db,row.id,state.counts);
    assert(C.num(solve.rareUse&&solve.rareUse[group.id])>0,
      `${row.name}: ${group.name}을 쓰지 않는데 "희귀함으로 만들 수 있는" 목록에 있다`);
  }
});

test('화면 배선: 희귀 제작 목록이 희귀 소모 기준 계산을 쓴다',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(/v153RareCraftRows\(state,plan\)\{/.test(app),'희귀 기준 헬퍼가 없다');
  assert(app.includes('내 희귀함으로 만들 수 있는 전설급'),'칸 제목이 희귀 기준을 밝히지 않는다');
  // 제목만 바꾸고 계산은 그대로 두는 회귀를 막는다.
  const crafts=app.slice(app.indexOf('v153-rare-crafts'),app.indexOf('v153-rare-crafts')+800);
  // 이 목록은 정의상 항상 희귀를 쓰므로 "소모 없음" 분기가 남아 있으면 안 된다.
  assert(!crafts.includes('희귀 직접 소모 없음'),'희귀를 안 쓰는 항목을 위한 분기가 렌더에 남아 있다');
  assert(!/v151BuildableLegendRows/.test(crafts),'희귀 칸이 여전히 비-희귀 계산을 쓴다');
});

test('정합성 가드가 1번 카드를 통째로 비우지 않는다',()=>{
  const source=fs.readFileSync(path.join(EXT,'ord_v15_engine.js'),'utf8');
  // v20.2: 가드가 네 번째 인자(showAction)를 받는다 — 0806 로그에서 필수
  // 역할 회귀로 막을 때 blockedAction 이 비어 카드가 통째로 빈 사례가
  // 나왔다(56라운드 중 20라운드 승인 0건).  막는 쪽이 "무엇을 막았는지"
  // 후보 행을 직접 실어 보낼 수 있게 하고, 안 실으면 종전 대체 카드로
  // 떨어진다.  둘 중 어느 쪽이든 blockedAction 은 절대 비지 않는다.
  const marker='const blocked=(state,reason,extra,showAction)=>';
  const at=source.indexOf(marker);
  assert(at>=0,'가드를 찾지 못했다');
  // v23.2: 가드 본문에 deficit-repair 우회 분기가 추가돼 창을 넓힌다 —
  // 계약(승인 차단 + blockedAction 유지) 자체는 불변.
  const body=source.slice(at,at+900);
  assert(/action:null/.test(body),'승인 차단(action:null)이 사라졌다 — 이 가드의 본래 목적이다');
  assert(!/blockedAction:null/.test(body),'blockedAction까지 비워 화면에 아무것도 안 남는다');
  assert(/blockedAction:showAction\|\|blockedFallback\(\)/.test(body),'대체 카드 배선이 없다');
  assert(source.includes('const blockedFallback=()=>'),'대체 카드 계산이 없다');
  // 회귀 게이트도 실제로 후보를 실어 보낸다(빈 카드 재발 방지).
  assert(/regressCandidate/.test(source),'회귀 게이트가 표시 후보를 만들지 않는다');
  assert(/blocked\('HOLD',[\s\S]{0,400}regressCandidate\)/.test(source),'회귀 게이트가 후보를 가드에 넘기지 않는다');
  assert(typeof E._test.reconcileSquadExecution==='function','가드가 테스트에 노출되지 않았다');
});

console.log(`V17_28_BLOCKED_CARD ${passed}/3 passed`);
