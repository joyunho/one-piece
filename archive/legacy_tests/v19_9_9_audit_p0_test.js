'use strict';
// v19.9.9 계약 — 외부 점검 보고서(v19.9.7 대상) P0 대응 1차.
//
// ① P0-1 로컬 직결 합성 id 공백: 카탈로그 unit.codes 역색인으로 세라핌·
//    왜곡·초월 등 합성 id 60종을 자동 매핑한다.  1:N 코드는 전원이 같은
//    상위의 폼 변형일 때만 첫 형태로 귀속하고(190H·DA0h·G90H), 진짜 다른
//    유닛이 공유하면(AA0H·BA0H) 매핑하지 않는다.  미해석 코드는 데이터
//    해시에 들어가 seq·dataChangedAt 을 반드시 움직이고, 건강 판정이
//    미해석 존재를 숨기지 않는다.
// ② P0-3 상위 2기 불변식: 서로 다른 상위 2기 보유 후 세 번째 상위 quote 는
//    원장 자체가 차단한다(플래너 경로 제한과 별개의 불변식).
// ③ P1 fail-open: 필수 행 누락 시 gap:Infinity 가 num() 에서 0이 되던
//    구멍을 유한 대부채(999)로 봉합 — 누락은 항상 미충족으로 남는다.
const assert=require('assert'),fs=require('fs'),path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_local_code_map.js','ord_data_patch.js','ord_core.js','ord_v15_model.js','ord_v15_ledger.js'])require(path.join(EXT,file));
const C=global.ORDCore,LM=global.ORD_LOCAL_MAP,M=global.ORDV15Model,L=global.ORDV15Ledger;
const units=global.ORD_TMO_UNITS,db=C.buildDb(units);
const catalogIds=new Set(units.map(u=>String(u.id)));
const boot=fs.readFileSync(path.join(EXT,'ord_boot_extension.js'),'utf8');
const planner=fs.readFileSync(path.join(EXT,'ord_squad_planner.js'),'utf8');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

const index=LM.buildCodeIndex(units,C.canonicalUpperId);

check('① 역색인 — 합성 id 전설급이 로우코드로 왕복된다(세라핌·왜곡·초월류)',()=>{
  // 실전 제작 대상 표본: 세라핌 S-호크(3A0h)·S-스네이크(Y90h), 왜곡
  // 블랙마리아(U40h)·에이스(V50h), 전설 쵸파 유력강화(K30h)·브륄레(S80h).
  const samples=[['3A0h',/S-호크/],['Y90h',/S-스네이크/],['U40h',/블랙마리아/],['V50h',/에이스/],['K30h',/유력강화/],['S80h',/브륄레/]];
  const t=LM.translate(Object.fromEntries(samples.map(([code])=>[code,1])),catalogIds,index);
  assert.deepStrictEqual(Array.from(t.unknown),[],`실전 제작 대상이 미해석으로 남음: ${t.unknown}`);
  for(const[code,re]of samples){
    const id=index.map[code];
    assert(id&&/^unit_/.test(id),`${code} 가 합성 id 로 안 풀림`);
    const unit=units.find(u=>String(u.id)===id);
    assert(re.test(String(unit&&unit.name)),`${code} → ${unit&&unit.name} — 이름 불일치`);
    assert.strictEqual(t.counts[id],1);
  }
  // 폼 변형 공유 코드는 첫 형태로 귀속(같은 캐노니컬) — (A)쵸파 190H.
  const chopper=index.map['190H'];
  assert(chopper,'폼 변형 공유 코드(190H)가 매핑되지 않음');
  // 진짜 다른 유닛이 공유하는 코드는 매핑 금지.
  for(const code of ['AA0H','BA0H']){
    assert(!(code in index.map),`${code} 는 서로 다른 유닛 공유 — 매핑하면 안 됨`);
    assert(index.ambiguous.includes(code),`${code} 가 다의 목록에 없음`);
  }
  // 무시 목록과 역색인이 충돌하면 실제 유닛이 가려진다 — 항상 빈 집합.
  assert.deepStrictEqual(Array.from(index.ignoredConflicts),[],'무시 코드가 카탈로그 codes 와 충돌');
  // 카탈로그 id 직결과 역색인이 서로 다른 답을 주면 안 된다.
  for(const[code,id]of Object.entries(index.map))if(catalogIds.has(code))assert.strictEqual(id,code,`${code}: 직결과 역색인 불일치`);
});

check('② 미해석 코드 — 해시를 반드시 움직이고 건강 판정에 드러난다',()=>{
  const before=LM.translate({'300h':3},catalogIds,index);
  const after=LM.translate({'300h':3,'ZZZ9x':1},catalogIds,index);
  assert.notStrictEqual(LM.countsHash(before),LM.countsHash(after),'미해석 유닛 등장이 해시를 안 바꿈 (P0-1 재발)');
  const grown=LM.translate({'300h':3,'ZZZ9x':2},catalogIds,index);
  assert.notStrictEqual(LM.countsHash(after),LM.countsHash(grown),'미해석 수량 변화가 해시를 안 바꿈');
  // 합성 스냅샷의 건강 판정: 미해석이 있으면 partial 로 드러난다.
  const now=Date.now();
  const auto=LM.nextLocalAutoRound(null,3,now,now);
  const s=LM.buildLocalSnapshot({translated:after,catalog:units,domStash:null,sessionId:'t',seq:1,dataChangedAt:now,autoRound:auto,now});
  assert.deepStrictEqual(Array.from(s.localDirect.unknownCodes),['ZZZ9x']);
  const health=C.snapshotHealth(s,now);
  assert.strictEqual(health.ready,true,'미해석 1종이 수집 전체를 죽이면 안 된다(아는 수량은 정상)');
  assert(health.label.includes('미해석'),`건강 라벨이 미해석을 숨김: ${health.label}`);
  // 브리지가 역색인을 실제로 쓴다.
  assert(boot.includes('buildCodeIndex'),'브리지가 역색인을 만들지 않음');
  assert(boot.includes('localCodeIndex'),'브리지가 역색인을 translate 에 전달하지 않음');
});

check('③ 상위 2기 불변식 — 원장 quote 가 세 번째 상위를 차단한다',()=>{
  const counts={'810e':50};
  const ryoku=units.find(u=>C.isUpper(u)&&/료쿠규/.test(u.name)),wb=units.find(u=>C.isUpper(u)&&/흰수염/.test(u.name));
  counts[ryoku.id]=1;counts[wb.id]=1;
  for(const u of units)if(C.isCommon(u))counts[u.id]=14;
  const model=M.build({catalog:units,snapshot:{counts,currentAbilities:{}},settings:{manualCounts:{},superKumaOwned:true,currentRound:50}});
  for(const namePattern of [/가반/,/거프/,/크로커다일/]){
    const third=units.find(u=>C.isUpper(u)&&namePattern.test(u.name));
    assert(third,`픽스처 상위 없음: ${namePattern}`);
    const quote=L.quote(model,third.id,counts,{});
    assert.strictEqual(quote.feasible,false,`${third.name}: 상위 2기 보유인데 제3 상위가 feasible`);
    assert(quote.blocked.some(reason=>reason.includes('세 번째 상위')),`${third.name}: 차단 사유 없음 — ${quote.blocked}`);
  }
  // 상위 1기만 보유하면 두 번째는 여전히 열려 있어야 한다(마딜 dual·물딜 2상위).
  const single={'810e':50};single[ryoku.id]=1;
  for(const u of units)if(C.isCommon(u))single[u.id]=14;
  const singleModel=M.build({catalog:units,snapshot:{counts:single,currentAbilities:{}},settings:{manualCounts:{},superKumaOwned:true,currentRound:50}});
  const second=units.find(u=>C.isUpper(u)&&/흰수염/.test(u.name));
  const q2=L.quote(singleModel,second.id,single,{});
  assert(!q2.blocked.some(reason=>reason.includes('세 번째 상위')),'상위 1기 보유인데 두 번째가 차단됨');
});

check('④ fail-open 봉합 — 필수 행 누락은 부족 0이 아니라 큰 부채로 남는다',()=>{
  // num(Infinity)===0 이 fail-open 의 뿌리였다 — 코어 계약 그대로인지 먼저 확인.
  assert.strictEqual(C.num(Infinity),0,'num(Infinity) 계약이 바뀌었으면 이 봉합의 전제를 다시 봐야 한다');
  assert(!planner.includes('gap:Infinity}'),'플래너에 gap:Infinity 잔존 — num() 에서 0이 되는 fail-open');
  const sealed=(planner.match(/gap:999/g)||[]).length;
  assert(sealed>=2,`누락 행 대부채 봉합 지점이 ${sealed}곳뿐`);
  assert(planner.includes('missingRow:true'),'누락 행 표식이 없음');
});

console.log(`\n${checks} checks passed (v19.9.9 외부 점검 P0 대응)`);
