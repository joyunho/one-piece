'use strict';
// v19.15.1 계약 — 0805 판(65라 도달) 포렌식 3종.
//
// ① 미해석 요동 디바운스: 전장 임시 개체(580h·T30e 등)가 초단위로
//    미해석 수량을 흔들어 63라에서 승인 카드가 2분간 8번 왕복했다.
//    연속 3회 같은 수량으로 관측된 미해석만 보드 해시에 들어간다.
//    'e' 접미(…0e) 코드는 전원 전투 임시라 아예 제외(실유닛 0e 는
//    위습 810e 뿐이고 위습은 카탈로그 직결이라 여기 오지 않는다).
// ② 보류 카드 명시: '소비 보류' 카드가 추천처럼 읽혔다(센고쿠 사건) —
//    HOLD 상태 큰 카드에 "추천이 아닙니다" 배너를 단다.
// ③ 도전 각: 지금 패로 성립하는 비주류 상위 1장 배지(순위 불변).
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const EXT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(EXT,file),'utf8');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

check('① 미해석 요동 디바운스 — 연속 3회 관측만 해시 반영, 0e 제외',()=>{
  const context={window:{}};vm.createContext(context);
  vm.runInContext(read('ord_local_code_map.js'),context,{filename:'lm.js'});
  const LM=context.window.ORD_LOCAL_MAP;
  assert(typeof LM.nextUnknownStability==='function','nextUnknownStability 없음');
  // 0805 실측 꼴: 상수 미해석(G00I) + 요동(580h 수량 널뜀 · T30e 명멸)
  let state=null;
  const feed=[
    {'G00I':1,'580h':1},
    {'G00I':1,'580h':3,'T30e':1},
    {'G00I':1},
    {'G00I':1,'580h':2},
    {'G00I':1,'580h':2,'T30e':4}
  ];
  const hashes=[];
  for(const unknown of feed){
    const out=LM.nextUnknownStability(state,unknown,Date.now());
    state=out;
    hashes.push(LM.countsHash({counts:{'300h':2},unknownCounts:unknown},out.stable));
  }
  // 요동(580h 수량 변화·T30e 명멸)에도 안정 집합은 G00I 하나 — 해시 불변.
  assert(state.stable.G00I===1,'상수 미해석이 안정 승격되지 않음');
  assert(!('580h' in state.stable),'요동 코드가 안정 집합에 들어감');
  assert(!('T30e' in state.stable),'0e 임시 코드가 안정 집합에 들어감');
  assert(new Set(hashes.slice(2)).size===1,`요동 구간 해시가 흔들림: ${hashes.join(',')}`);
  // 계약 유지(v19.9.9): 새 상수 미해석은 3회째부터 해시를 바꾼다 —
  // "방금 만든 유닛이 미해석"이 3초 안에 화면에 잡힌다.
  assert(hashes[0]!==hashes[2],'안정 승격이 해시를 바꾸지 않음');
  // 인자 생략 시 종전 동작(하위 호환).
  assert(LM.countsHash({counts:{},unknownCounts:{'X':1}})!==LM.countsHash({counts:{},unknownCounts:{}}),'하위 호환 깨짐');
});

check('② 배선 — 두 부트 안정화 + 스냅샷 안정 집합 노출 + 보류 배너',()=>{
  for(const boot of ['ord_boot_desktop.js','ord_boot_extension.js']){
    const src=read(boot);
    assert(src.includes('nextUnknownStability')&&src.includes('countsHash(translated, stableUnknown)'),`${boot} 안정화 배선 없음`);
    assert(src.includes('stableUnknown,')||src.includes('stableUnknown\n'),`${boot} 스냅샷 전달 없음`);
  }
  assert(read('ord_local_code_map.js').includes('opts.stableUnknown'),'스냅샷 안정 집합 노출 없음');
  const app=read('ord_app.js');
  assert(app.includes('v1915-hold-banner')&&app.includes('지금 만들라는 추천이 아닙니다'),'보류 카드 배너 없음');
});

check('③ 도전 각 — 비주류·현재 패 성립 후보 배지 (순위 불변)',()=>{
  const engine=read('ord_v15_engine.js');
  assert(engine.includes('challengeAngle')&&engine.includes('metaShare)<2'),'도전 각 로직 없음');
  assert(engine.includes('row.feasible===true'),'도전 각이 성립 불가 후보에 붙을 수 있음');
  const app=read('ord_app.js');
  assert(app.includes('v1915-challenge')&&app.includes('도전 각 — 비주류지만 이 패로 성립'),'도전 각 배지 없음');
  const css=read('ord_cockpit_v15.css');
  assert(css.includes('.v1915-hold-banner')&&css.includes('.v1915-challenge'),'배너·배지 스타일 없음');
});

console.log(`\n${checks} checks passed (v19.15.1 요동 디바운스·보류 명시·도전 각)`);
