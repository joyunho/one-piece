'use strict';

// v18.1 — TMO 읽기 누락 보정.
//
// 사용자 신고 두 가지: "지금 할 일이 자꾸 바뀐다", "지금 할 일만 보고
// 만들었는데 50라도 못 깨고 죽었다".  v18.0.0으로 실제 플레이한 로그
// (ORD_2305_20260728_170254, 53라 사망)를 재생해서 원인을 찾았다.
//
// 사용자가 27라에 고정한 상위 (S)료쿠규(LB0H)가 스냅샷에서 **스무 번**
// 사라졌다 되돌아왔다.  같은 스냅샷에서 다른 유닛은 하나도 안 바뀌었고
// 관측 신뢰도는 0.998이었다 — 제작으로 소비된 게 아니라 그 유닛만
// 목록에서 빠진 것이다.  소실 구간은 스무 번 모두 읽기 1~3회였고
// 영구 소실은 0건이었다.
//
// 그런데 한 번 빠질 때마다 역할표가 통째로 무너졌다:
//   상위 1→0 · 방깎 92→57 · 이감 42.5→30
// 판정은 그때마다 다른 판을 보고 다시 계산했고, 그래서 화면의 "지금 할
// 일"이 만드는 도중에 바뀌었다.  r45는 한 라운드 안에서 readiness가
// 76↔50을 네 번 오갔다.  생존축 readiness도 34→29, 56→29, 78→51,
// 82→55로 계속 되감겼고 끝까지 못 닫은 채 53라에 죽었다.

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
const warn=console.warn;console.warn=()=>{};
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
console.warn=warn;

const C=global.ORDCore;
const db=C.buildDb(global.ORD_TMO_UNITS);
const Compactor=require(path.join(EXT,'ord_run_log_compactor.js'));
const LOG=path.join(ROOT,'data/ORD_2305_20260728_170254_active.ordlog.json');
const UPPER='LB0H';

let passed=0;
function test(name,fn){fn();passed+=1;console.log(`PASS ${name}`);}

// 실전 로그의 스냅샷을 순서대로 접으면서, 보정 전/후의 상위 소실→복귀
// 횟수를 함께 센다.
function replaySnapshots(){
  const log=JSON.parse(fs.readFileSync(LOG,'utf8'));
  const events=log.events.slice().sort((a,b)=>a.seq-b.seq).filter(e=>e.type==='snapshot');
  let baseline=null,guard=null,rawFlaps=0,fixedFlaps=0,heldReads=0;
  let rawGone=false,fixedGone=false;
  for(const event of events){
    const beforeRaw=baseline?Number(baseline.counts[UPPER]||0):0;
    baseline=Compactor.applySnapshotRecord(baseline,event.payload,{digest:false});
    const nowRaw=Number(baseline.counts[UPPER]||0);
    if(beforeRaw>0&&nowRaw===0)rawGone=true;
    else if(nowRaw>0&&rawGone){rawFlaps++;rawGone=false;}

    const beforeFixed=guard?Number(guard.counts[UPPER]||0):0;
    const result=C.stabilizeFinalUnits(guard,baseline.counts,db,{});
    guard={counts:Object.assign({},result.counts),misses:result.misses};
    if(result.held.length)heldReads++;
    const nowFixed=Number(result.counts[UPPER]||0);
    if(beforeFixed>0&&nowFixed===0)fixedGone=true;
    else if(nowFixed>0&&fixedGone){fixedFlaps++;fixedGone=false;}
  }
  return{rawFlaps,fixedFlaps,heldReads};
}

test('실전 로그의 상위 소실→복귀 20회가 0회가 된다',()=>{
  const {rawFlaps,fixedFlaps,heldReads}=replaySnapshots();
  assert.strictEqual(rawFlaps,20,`원본 로그의 소실→복귀가 ${rawFlaps}회다 — 이 테스트의 전제가 바뀌었다`);
  assert.strictEqual(fixedFlaps,0,`보정 후에도 ${fixedFlaps}회 남았다`);
  assert(heldReads>0,'보정이 한 번도 개입하지 않았다');
});

test('제작으로 소비된 최종 유닛은 유지하지 않는다',()=>{
  // 상위를 재료로 먹는 제작은 정상이다.  그걸 붙잡고 있으면 장부가 틀어진다.
  const prev={counts:{[UPPER]:1},misses:{}};
  const held=C.stabilizeFinalUnits(prev,{},db,{});
  assert.strictEqual(C.num(held.counts[UPPER]),1,'근거 없는 소실은 유지해야 한다');
  const consumed=C.stabilizeFinalUnits(prev,{},db,{consumed:[UPPER]});
  assert.strictEqual(C.num(consumed.counts[UPPER]),0,'제작이 설명하는 소실까지 되살리면 안 된다');
  assert.deepStrictEqual(consumed.held,[]);
});

test('계속 안 보이면 결국 없는 것으로 받아들인다',()=>{
  // 진짜로 사라진 경우까지 영원히 붙잡으면 그것도 거짓말이다.
  let guard={counts:{[UPPER]:1},misses:{}};
  let released=null;
  for(let read=0;read<C.FINAL_UNIT_HOLD_READS+1;read++){
    const result=C.stabilizeFinalUnits(guard,{},db,{});
    guard={counts:Object.assign({},result.counts),misses:result.misses};
    if(result.released.length)released=result.released[0];
  }
  assert(released,`${C.FINAL_UNIT_HOLD_READS}회 넘게 안 보여도 계속 유지한다`);
  assert.strictEqual(released.id,UPPER);
  assert.strictEqual(C.num(guard.counts[UPPER]),0);
});

test('희귀·흔함은 유지 대상이 아니다',()=>{
  // 재료로 정상 소비되는 등급이라 붙잡으면 장부가 틀어진다.
  const rare=db.rares[0];
  assert(rare,'희귀 샘플이 없다');
  const result=C.stabilizeFinalUnits({counts:{[rare.id]:2},misses:{}},{[rare.id]:1},db,{});
  assert.strictEqual(C.num(result.counts[rare.id]),1,'희귀 감소를 되돌렸다');
  assert.deepStrictEqual(result.held,[]);
});

test('화면 배선: 스냅샷이 판단에 들어가기 전에 보정을 거친다',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(/stabilizeSnapshot\(snapshot\)\{/.test(app),'보정 헬퍼가 없다');
  assert(app.includes('snapshot=this.stabilizeSnapshot(snapshot);this.state.snapshot=snapshot;'),
    '보정이 상태 저장보다 뒤에 있으면 판단은 보정 전 값을 본다');
  assert(/C\.stabilizeFinalUnits/.test(app),'앱이 core 보정을 쓰지 않는다');
});

console.log(`V18_1_SNAPSHOT_HOLD ${passed}/5 passed`);
