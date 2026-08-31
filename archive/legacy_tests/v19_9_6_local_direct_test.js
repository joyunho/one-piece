'use strict';
// v19.9.6 계약 — A안 로컬 직결 수집기.
//
// 0801 실측 48쌍 표본으로 /datas 로우코드↔카탈로그 id 매핑을 확정했고,
// 이제 TMO 탭 없이 로컬 서버만으로 수량을 수집한다.  계약의 축:
//  · 매핑은 "카탈로그 id 직결 + 궤적 확정 3종 + 무시 목록"이며, 상수 궤적
//    동률로 구분 불가한 PA0H·Y50h 는 절대 확정하지 않는다(위양성 방지).
//  · 합성 스냅샷은 소유 전수 계약(없으면 0이 서버 기준 진실)이고, 완성도%
//    ·현재 능력치는 신선한 DOM 패가 있을 때만 보강한다.
//  · 로컬이 신선한 동안 DOM 패는 보강 저장고로만 쌓인다 — 두 소스를
//    번갈아 적용해 수량이 오르내리면 감지 계열이 전부 흔들린다.
//  · 자동 라운드는 "실전 유닛 0→1 전이"만 세대를 올리고, 판 중간 최초
//    사용(콜드 스타트)은 채택만 한다 — 올리면 라운드가 1로 되돌아간다.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const boot=read('ord_boot_extension.js'),background=read('background.js'),popup=read('popup.js'),helperHtml=read('ord_helper.html');
let checks=0;const check=async(name,fn)=>{await fn();checks++;console.log('PASS ',name);};

const context={console,setTimeout,clearTimeout};context.window=context;vm.createContext(context);
for(const file of ['ord_units_data.js','ord_local_code_map.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const LM=context.ORD_LOCAL_MAP,C=context.ORDCore,catalog=context.ORD_TMO_UNITS;
const catalogIds=new Set(catalog.map(u=>String(u.id)));

(async()=>{
await check('① 매핑 확정 — 궤적 3종만, 상수 동률 PA0H·Y50h 는 무시 목록',()=>{
  assert.deepStrictEqual(Object.assign({},LM.CODE_MAP),{
    '060h':'unit_1767884925665_1037', // 해적선: 수량 2→1→0 궤적 완전 일치
    'H00h':'unit_1767884889420_456',  // 좀비: 단독 스파이크 2 일치
    'S40h':'unit_1767884940750_9880'  // 초월쿠마: 첫 표본 단독 1 일치
  },'궤적 확정 3종 외 매핑이 섞임');
  // PA0H 는 판 내내 상수 1(위양성)이라 확정 금지·무시 유지.  Y50h 는
  // v23.0 재핀: 2312 카탈로그가 '고대의 배'의 codes 로 직접 확정해 무시를
  // 해제했다 — 카탈로그 직결이 궤적 추정보다 권위가 높다.
  assert(!('PA0H' in LM.CODE_MAP),'PA0H 를 상수 궤적 위양성인데 확정함');
  assert(LM.IGNORE_CODES.includes('PA0H'),'PA0H 가 무시 목록에 없음');
  assert(!LM.IGNORE_CODES.includes('Y50h'),'Y50h 무시가 남아 카탈로그 직결(고대의 배)을 가린다');
  for(const code of ['GOLD','LUMBER','FOOD'])assert(LM.IGNORE_CODES.includes(code),`자원 ${code} 무시 누락`);
  // 카탈로그에 실존하는 id 를 무시 목록에 넣으면 실제 유닛이 사라진다.
  for(const code of LM.IGNORE_CODES)assert(!catalogIds.has(code),`무시 코드 ${code} 가 카탈로그 id 와 충돌`);
  for(const[code,id]of Object.entries(LM.CODE_MAP))assert(catalogIds.has(id),`확정 대상 ${code}→${id} 가 카탈로그에 없음`);
});

await check('② 번역 — 직결·확정·무시·미해석 네 갈래(0801 실측 꼴)',()=>{
  const t=LM.translate({
    '300h':8,'810e':20,'Z90h':1,        // 직결(카탈로그 id 그대로)
    '060h':2,'S40h':1,                  // 궤적 확정(특수재료)
    'GOLD':54535,'PA0H':1,'XI0e':1,     // 무시(자원·환경·일시)
    'ZZZ9x':3                           // 미해석 — 버리되 진단에 남김
  },catalogIds);
  assert.strictEqual(t.counts['300h'],8);
  assert.strictEqual(t.counts['unit_1767884925665_1037'],2,'해적선 확정 매핑 미적용');
  assert.strictEqual(t.counts['unit_1767884940750_9880'],1,'초월쿠마 확정 매핑 미적용');
  assert.strictEqual(t.wisp,20);assert.strictEqual(t.wispFound,true);
  assert(!('GOLD'in t.counts)&&!('PA0H'in t.counts),'무시 코드가 수량에 들어감');
  assert.deepStrictEqual(Array.from(t.unknown),['ZZZ9x'],'미해석 코드 수집 실패');
  assert.strictEqual(t.ignored,3);
  // 실전 유닛 수 = 위습·특수재료 제외 총수(자동 라운드 시작 판정용).
  assert.strictEqual(t.playableUnitCount,9,'playable 에 위습·특수재료가 섞임');
});

await check('③ 합성 스냅샷 — 소유 전수 계약 + snapshotHealth ready',()=>{
  const now=Date.now();
  const t=LM.translate({'300h':3,'810e':7,'060h':1},catalogIds);
  const auto=LM.nextLocalAutoRound(null,t.playableUnitCount,now,now);
  const s=LM.buildLocalSnapshot({translated:t,catalog,domStash:null,sessionId:'local-test',seq:1,dataChangedAt:now,autoRound:auto,now});
  assert.strictEqual(s.source,'local-direct');
  assert.strictEqual(s.counts['300h'],3);
  assert.strictEqual(s.wispCount,7);
  assert.strictEqual(s.wispCountFound,true,'/datas 는 보유 전수라 위습은 항상 확인 상태');
  assert.strictEqual(s.collection.found,true);
  const health=C.snapshotHealth(s,now);
  assert.strictEqual(health.ready,true,`로컬 직결 신선인데 ready 아님: ${health.label}`);
  assert(health.key==='partial','보강 전에는 partial(%·능력치 대기)여야 함');
  assert.strictEqual(C.snapshotHealth(Object.assign({},s,{bridgeAt:now-13000,at:now-13000,scanAt:now-13000}),now).ready,false,'13초 묵은 로컬 수신이 ready');
  assert.strictEqual(C.snapshotHealth(Object.assign({},s,{wispCountFound:false}),now).ready,false,'위습 미확인이 ready');
  // 위습이 다 소진돼 /datas 에 810e 키가 없어도 0이 진실 — ready 유지.
  const t0=LM.translate({'300h':3},catalogIds);
  const s0=LM.buildLocalSnapshot({translated:t0,catalog,domStash:null,sessionId:'local-test',seq:2,dataChangedAt:now,autoRound:auto,now});
  assert.strictEqual(s0.wispCount,0);
  assert.strictEqual(C.snapshotHealth(s0,now).ready,true,'위습 0 보유가 ready 를 깨뜨림');
  // normalizeState 파이프라인 호환 — 없는 유닛은 0으로 정규화된다.
  const ns=C.normalizeState(catalog,s,{manualCounts:{},superKumaOwned:false});
  assert.strictEqual(C.num(ns.counts['300h']),3);
  assert.strictEqual(C.num(ns.counts['200h']),0,'미보유 유닛이 0이 아님');
});

await check('④ DOM 보강 — 신선하면 %·능력치 병합, 수량은 항상 로컬이 이김',()=>{
  const now=Date.now();
  const t=LM.translate({'300h':3,'810e':7},catalogIds);
  const auto=LM.nextLocalAutoRound(null,t.playableUnitCount,now,now);
  const freshDom={scanAt:now-5000,units:[{id:'300h',count:9,tmoPercent:44},{id:'K00h',count:2,tmoPercent:61}],currentAbilities:{'이동속도 감소':'30','스턴':'0.5','공격력 증가':'10'}};
  const s=LM.buildLocalSnapshot({translated:t,catalog,domStash:freshDom,sessionId:'local-test',seq:3,dataChangedAt:now,autoRound:auto,now});
  const row300=s.units.find(u=>u.id==='300h'),rowK=s.units.find(u=>u.id==='K00h');
  assert.strictEqual(row300.count,3,'DOM 수량(9)이 로컬 수량(3)을 이겼다');
  assert.strictEqual(row300.tmoPercent,44,'완성도% 보강 실패');
  assert.strictEqual(rowK.count,0,'/datas 에 없는 유닛은 0이 서버 기준 진실');
  assert.strictEqual(rowK.tmoPercent,61,'진행도만 있는 유닛의 % 보강 실패');
  assert.strictEqual(s.abilityCount,3,'현재 능력치 보강 실패');
  assert.strictEqual(C.snapshotHealth(s,now).key,'ok','보강 완료면 ok');
  // 묵은 DOM(61초)은 보강하지 않는다 — 죽은 %로 판을 오도하지 않는다.
  const staleDom=Object.assign({},freshDom,{scanAt:now-61000});
  const s2=LM.buildLocalSnapshot({translated:t,catalog,domStash:staleDom,sessionId:'local-test',seq:4,dataChangedAt:now,autoRound:auto,now});
  assert.strictEqual(s2.abilityCount,0,'묵은 DOM 능력치가 섞임');
  assert(!s2.units.some(u=>u.id==='K00h'),'묵은 DOM 진행도 행이 섞임');
});

await check('⑤ 자동 라운드 미러 — 0→1 전이만 세대 상승, 콜드 스타트는 채택',()=>{
  const now=Date.now();
  // 판 중간 최초 사용: 기록이 없는데 유닛이 많다 — 세대 0 유지(리셋 금지).
  const adopt=LM.nextLocalAutoRound(null,23,now,now);
  assert.strictEqual(adopt.generation,0,'콜드 스타트가 세대를 올려 라운드를 1로 되돌린다');
  assert.strictEqual(adopt.active,true);
  assert.strictEqual(adopt.sourceEpoch,LM.LOCAL_SOURCE_EPOCH);
  // 판 시작 전(0) → 첫 유닛: 세대 +1 = 1라운드 자동 시작.
  const idle=LM.nextLocalAutoRound(null,0,0,now);
  assert.strictEqual(idle.active,false);
  const start=LM.nextLocalAutoRound(idle,1,now,now);
  assert.strictEqual(start.generation,1,'첫 유닛 감지가 세대를 안 올림');
  // 판 지속: 세대 유지.  판 종료(빈 응답) → 비활성.  둘째 판 → 세대 2.
  const mid=LM.nextLocalAutoRound(start,40,now,now);
  assert.strictEqual(mid.generation,1);assert.strictEqual(mid.active,true);
  const over=LM.nextLocalAutoRound(mid,0,0,now);
  assert.strictEqual(over.active,false);
  const second=LM.nextLocalAutoRound(over,2,now,now);
  assert.strictEqual(second.generation,2,'둘째 판이 새 세대가 아님');
});

await check('⑥ 브리지 계약 — 로컬 신선 시 DOM 은 보강 전용, fetch 는 배경 한 곳',()=>{
  assert(helperHtml.includes('ord_local_code_map.js'),'헬퍼 페이지에 매핑 모듈 미적재');
  assert(boot.includes('ORD_LOCAL_MAP'),'브리지가 매핑 모듈을 안 씀');
  assert(boot.includes("local.domStash = snapshot;")&&boot.includes('if (localFresh()) return;'),'DOM 보강 전용 게이트 없음');
  assert(boot.includes("runtime({type: 'ORD_LOCAL_PROBE'"),'로컬 읽기가 배경 경유가 아님');
  assert(!boot.includes("fetch('http://127.0.0.1"),'브리지가 127.0.0.1 을 직접 fetch — 주소 허용목록은 background 한 곳이어야 함');
  assert(boot.includes('2500'),'2.5초 폴링 없음');
  assert(boot.includes('ordLocalDirectFeed'),'숨김 대시보드 피드 리스너 없음');
  assert(boot.includes("source === 'local-direct'"),'clearSource 가 로컬 스냅샷을 지운다');
  assert(boot.includes('ordLocalAutoRound'),'자동 라운드 세대 영속화 없음');
});

await check('⑦ 배경·팝업 — /datas 원본 15초 저장 + 팝업 로컬 직결 표시',()=>{
  assert(background.includes('ordLocalDirectFeed'),'배경이 피드를 저장하지 않음');
  assert(background.includes('ok: !!live'),'fetch 실패를 ok:false 로 구분하지 않음');
  assert(popup.includes('ordLocalDirectFeed')&&popup.includes('로컬 직결'),'팝업 로컬 직결 표시 없음');
  assert(popup.includes('changes.ordLocalDirectFeed'),'팝업이 피드 변경을 구독하지 않음');
});

console.log(`\n${checks} checks passed (v19.9.6 로컬 직결 수집기)`);
})().catch(error=>{console.error('FAIL',error&&error.stack||error);process.exit(1);});
