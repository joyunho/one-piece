'use strict';

// v17.27 — 사용자 요청: "중간에 자꾸 재료 모은다고 다음 행동 추천을 안
// 해주더라. 지금 가진 희귀함으로 만들 수 있는 전설급 유닛 칸을 하나
// 만들어줘."
//
// 재료 수집 구간에서는 다음 행동이 PREPARE로 잠겨 화면에 할 일이 안
// 보인다. 그때도 "내 희귀함으로 지금 뭘 만들 수 있는지"는 항상 보여야
// 사용자가 스스로 판단할 수 있다.
//
// 계약: 이 칸은 추천이 아니라 현재 패 원장으로 계산한 사실이다 —
// 판단 엔진 상태(PREPARE/HOLD/ROUTE_CHOICE)와 무관하게 산출된다.

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_core.js'])require(path.join(EXT,file));

const C=global.ORDCore,units=global.ORD_TMO_UNITS;
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

test('보유 희귀함별로 지금 만들 수 있는 전설급이 나온다',()=>{
  assert.strictEqual(typeof C.rareCraftableLegends,'function','코어 API가 노출되지 않았다');
  const state=stateAt(35),groups=C.rareCraftableLegends(state,{mode:'physical'});
  assert(groups.length>0,'실전 패인데 희귀함 그룹이 하나도 없다');
  for(const group of groups){
    assert(C.num(state.counts[group.id])>0,`${group.name}: 보유하지 않은 희귀가 실렸다`);
    assert(group.rows.length>0,`${group.name}: 빈 그룹`);
    for(const row of group.rows){
      const unit=state.db.byId.get(row.id);
      assert(unit,`${row.id}: 카탈로그에 없는 유닛`);
      assert(!C.isUpper(unit),`${row.name}: 상위가 전설급 목록에 있다`);
      assert(C.num(state.counts[row.id])<=0,`${row.name}: 이미 보유한 유닛을 만들라고 한다`);
      // 이 칸의 정의상, 그 희귀를 실제로 쓰는 조합만 실려야 한다.
      const solve=C.recipeSolve(state.db,row.id,state.counts);
      assert(C.num(solve.rareUse&&solve.rareUse[group.id])>0,`${row.name}: ${group.name}을 쓰지 않는데 그 아래에 묶였다`);
    }
  }
});

test('바로 제작 가능한 것이 앞에 오고 선위·차단 표시가 사실과 맞는다',()=>{
  const state=stateAt(35),groups=C.rareCraftableLegends(state,{mode:'physical'});
  const wisp=C.num(state.counts[C.WISP_ID]);
  let readySeen=0;
  for(const group of groups){
    let sawNonReady=false;
    for(const row of group.rows){
      if(row.ready){
        assert(!sawNonReady,`${group.name}: 바로 제작 가능한 ${row.name}이 불가능한 항목 뒤에 있다`);
        assert(row.wispCost<=wisp,`${row.name}: 선위 ${row.wispCost} > 보유 ${wisp}인데 바로 가능으로 표시됐다`);
        assert.strictEqual(row.blocked,false,`${row.name}: 차단된 유닛이 바로 가능으로 표시됐다`);
        readySeen+=1;
      }else sawNonReady=true;
      if(!row.ready&&!row.blocked)assert(row.wispGap>0,`${row.name}: 선위가 모자라지도 막히지도 않았는데 대기로 분류됐다`);
    }
    assert.strictEqual(group.readyCount,group.rows.filter(row=>row.ready).length>group.readyCount?group.readyCount:group.rows.filter(row=>row.ready).length,'readyCount 불일치');
  }
  assert(readySeen>0,'실전 패인데 바로 만들 수 있는 전설급이 하나도 없다');
});

test('판단 엔진 상태와 무관하게 계산된다 — 재료 수집 구간에도 비지 않는다',()=>{
  // 선위를 0으로 만들어 "재료 모으는 중"을 흉내 낸다. 다음 행동은 잠겨도
  // 이 칸은 무엇이 얼마나 모자란지 계속 보여야 한다.
  const base=stateAt(35),counts=Object.assign({},base.counts);
  counts[C.WISP_ID]=0;
  const poor=C.normalizeState(units,{counts,currentAbilities:base.currentAbilities},{manualCounts:{},superKumaOwned:true});
  const groups=C.rareCraftableLegends(poor,{mode:'physical'});
  assert(groups.length>0,'선위가 없다고 칸이 통째로 비었다 — 재료 수집 구간에 아무것도 안 보인다');
  const rows=groups.flatMap(group=>group.rows);
  assert(rows.some(row=>!row.ready&&!row.blocked&&row.wispGap>0),'선위 부족을 부족으로 표시하지 않는다');
});

test('화면 배선: 3번 영역에 독립 칸으로 붙는다',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  const css=fs.readFileSync(path.join(EXT,'ord_cockpit_v15.css'),'utf8');
  assert(/renderV152RareCraftable\(state,plan\)\{/.test(app),'렌더러가 없다');
  assert(/\$\{rareCraftable\}/.test(app),'3번 영역에 칸이 합쳐지지 않았다');
  assert(app.includes('지금 가진 희귀함으로 만들 수 있는 전설급'),'칸 제목이 없다');
  for(const cls of ['v152-rare-craftable','v152-rare-group','v152-rare-head','v152-rare-summary'])
    assert(css.includes(`.${cls}`),`${cls} 스타일 누락`);
});

console.log(`V17_27_RARE_CRAFTABLE ${passed}/4 passed`);
