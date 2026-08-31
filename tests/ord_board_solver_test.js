'use strict';

// ORD 악몽 보드(v28 전면 신작) — 레시피 솔버 파리티 게이트.
//
// 신작 core.solve 는 구 정본 recipeSolve 와 의미론이 같아야 한다(게임
// 규칙은 하나다): 위습 환산·재고 소비·하드 선행·스톡 잔량.  전설급·상위
// 전수 × 3픽스처(빈손/풍족/희소)에서 wispCost·hardMissing·consumed·
// stockAfter 완전 일치를 계약한다.  구 모듈은 여기(테스트)의 오라클로만
// 쓰인다 — 런타임 신작은 옛 파일을 로드하지 않는다.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const OLD=path.join(__dirname,'..','archive','legacy_program');
const NEW=path.join(__dirname,'..','ord_board');

const octx={console};octx.window=octx;vm.createContext(octx);
for(const f of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_meta_stats.js','ord_clear_stats.js','ord_core.js'])
  vm.runInContext(fs.readFileSync(path.join(OLD,f),'utf8'),octx,{filename:f});
const C=octx.ORDCore,units=octx.ORD_TMO_UNITS,db=C.buildDb(units);

const nctx={console};nctx.window=nctx;nctx.globalThis=nctx;vm.createContext(nctx);
for(const f of ['data.js','core.js'])
  vm.runInContext(fs.readFileSync(path.join(NEW,f),'utf8'),nctx,{filename:f});
const B=nctx.ORD_BOARD_CORE,index=B.buildIndex(nctx.ORD_BOARD_DATA);

const fixtures={
  empty:{},
  rich:(()=>{const c={};for(const u of units)if(['흔함','안흔함','특별함'].includes(u.groupName)&&u.id!=='810e')c[u.id]=2;c['810e']=8;return c;})(),
  scarce:(()=>{const c={};let r=0,un=0,co=0;for(const u of units){if(u.groupName==='희귀함'&&r<7){c[u.id]=1;r++;}if(u.groupName==='안흔함'&&un<8){c[u.id]=1;un++;}if(u.groupName==='흔함'&&u.id!=='810e'&&co<6){c[u.id]=1;co++;}}c['810e']=6;return c;})()
};

let total=0,mismatch=0;
const sortEntries=obj=>JSON.stringify(Object.entries(obj||{}).filter(([,v])=>v>0).sort());
for(const [name,counts] of Object.entries(fixtures)){
  for(const u of units){
    if(!C.isLegendish(u)&&!C.isUpper(u))continue;
    total+=1;
    const o=C.recipeSolve(db,u.id,counts);
    const n=B.solve(index,u.id,counts);
    const ok=Math.abs(o.wispCost-n.wispCost)<1e-9
      &&(o.hardMissing||[]).map(h=>h.id).sort().join()===(n.hardMissing||[]).map(h=>h.id).sort().join()
      &&sortEntries(o.consumed)===sortEntries(n.consumed)
      &&sortEntries(o.stockAfter)===sortEntries(n.stockAfter);
    if(!ok){mismatch+=1;if(mismatch<=5)console.log(`MISMATCH ${name} ${u.id} ${u.name}`);}
  }
}
assert(total>=400,`파리티 표본이 너무 적다: ${total}`);
assert.strictEqual(mismatch,0,`솔버 파리티 붕괴: ${mismatch}/${total}`);
console.log(`ORD_BOARD_SOLVER 파리티 ${total}/${total} passed`);
