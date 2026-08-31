'use strict';

// v24.1.0 계약 — 실측 페어 데이터 2상위 랭킹 배선.
//
// 사용자(0823): "이렇게 간략화 시켜도 제대로 추천을 못하면 의미가 없잖아"
// → 2상위 후보 랭킹이 악몽 상위 2기 클리어 코퍼스(62,472판, tmo /clear
// 시즌 2 전수)를 전혀 안 보고 있었다.  페어 코퍼스를 정본 id 로 병합해
// (이름+티어 매칭, 세라핌 4기 포함, 62,052판=99.3% 커버) 배선한다.
//
// 용도 경계(클리어 실측 전반과 동일): 표시·경고 + "동급(제작 가능·티어·
// 처방 동일) 안의 타이브레이크" 전용.  게이트가 아니다 — 실측 0판도
// 목록에 남고, 제작 가능·파워 티어가 다르면 실측이 순서를 못 바꾼다.
//
// ① 데이터 — ORD_CLEAR_STATS.pairs 정본 병합(징베+S-호크 2611판 스팟).
// ② 코어 — pairClearGames(순서 무관·변형 정규화) · pairClearBucket(0/30).
// ③ 랭킹 — 동급 안에서 버킷이 선위보다 먼저, 다른 급은 실측이 못 뒤집음.
// ④ UI — 2상위 카드·파티 패널 실측 배지(0판 경고는 기록 있는 판에서만),
//    메인 후보 카드 단독 실측 배지.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const appSrc=read('ord_app.js');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_clear_stats.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,App=context.ORDApp.App,units=context.ORD_TMO_UNITS;
const stats=context.ORD_CLEAR_STATS;
const state=C.normalizeState(units,{counts:{},currentAbilities:{}},{manualCounts:{}});
const appStub=()=>{
  const app=Object.create(App.prototype);
  app.state={mode:'magic',magicRoute:'auto',virtualSpecialId:'',locks:[],currentRound:35,rerollsUsed:0,navFamily:'none',navPerk:'',transcendUsed:0,seraphUsed:0};
  app.v197PrescribedSecondIds=()=>[];
  app.actualRound=()=>35;
  return app;
};

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① 데이터 — pairs 정본 병합(스팟: 징베+S-호크 2611판, 99% 커버)',()=>{
  assert(stats&&stats.pairs&&Object.keys(stats.pairs).length>=800,'pairs 키 부족');
  assert(C.num(stats.pairGames)>=60000,'병합 판수 부족 — 이름+티어 매칭 회귀');
  assert(C.num(stats.pairSkippedGames)<=1000,'미해석 판수 폭증 — 매칭 회귀');
  const jinbe=state.db.uppers.find(u=>/징베/.test(String(u.name)));
  const hawk=units.find(u=>/S-호크/.test(String(u.name)));
  assert(jinbe&&hawk,'스팟 유닛 소실');
  assert(C.pairClearGames(jinbe.id,hawk.id)>=2611,'징베+S-호크 스팟 실패(세라핌 매칭 회귀)');
});

test('② 코어 — 순서 무관 · 버킷 경계(0 / 1~29 / 30+)',()=>{
  const jinbe=state.db.uppers.find(u=>/징베/.test(String(u.name)));
  const hawk=units.find(u=>/S-호크/.test(String(u.name)));
  assert.strictEqual(C.pairClearGames(jinbe.id,hawk.id),C.pairClearGames(hawk,jinbe),'페어 키가 순서 의존');
  assert.strictEqual(C.pairClearGames('','X'),0);
  assert.strictEqual(C.pairClearBucket(0),0);
  assert.strictEqual(C.pairClearBucket(29),1);
  assert.strictEqual(C.pairClearBucket(30),2);
});

test('③ 랭킹 — 동급 안 버킷 우선, 급이 다르면 실측이 못 뒤집는다',()=>{
  const rows=appStub().v19SecondUpperCandidates(state,{mode:'magic',deficits:{rows:[]},settings:{}},state.db.uppers.find(u=>/빅맘/.test(String(u.name))));
  assert(rows.length>=3,'후보 부족');
  for(const row of rows)assert(typeof row.pairGames==='number','pairGames 필드 부재');
  // 정렬 불변식: 인접 순서마다 (feasible → tier → bucket → wisp) 사전식.
  for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i];
    const cls=x=>[Number(x.feasible),C.num(x.tier.rank)];
    const [af,at]=cls(a),[bf,bt]=cls(b);
    if(af!==bf){assert(af>bf,'제작 가능이 뒤로 밀림');continue;}
    if(at!==bt){assert(at>bt,'파워 티어가 실측에 뒤집힘');continue;}
    const ab=C.pairClearBucket(a.pairGames),bb=C.pairClearBucket(b.pairGames);
    if(ab!==bb){assert(ab>bb,'동급에서 실측 버킷이 밀림');continue;}
    assert(a.wispCost<=b.wispCost,'동급·동버킷에서 선위 역전');
  }
  // 동급 안 실증: 버킷 2 후보가 버킷 0~1 후보보다 앞에 있고, 그 사이에
  // 선위만 싼 미검증 후보가 끼어들지 않았다(위 불변식이 이미 보장).
  assert(rows.some(row=>C.pairClearBucket(row.pairGames)>=2),'검증(30판+) 후보가 목록에 없음 — 데이터 배선 회귀');
  // 소스 계약: 버킷은 처방 다음 · 선위 앞.
  assert(/prescRank\(b\)-prescRank\(a\)\|\|pairBucket\(b\)-pairBucket\(a\)\|\|a\.wispCost-b\.wispCost/.test(appSrc),'정렬 위치 계약 소실');
});

test('④ UI — 실측 배지 배선(2상위 카드·파티 패널·메인 후보)',()=>{
  assert(appSrc.includes('v241-pair'),'페어 배지 부재');
  assert(appSrc.includes('v241-solo'),'단독 실측 배지 부재');
  // 0판 경고는 다른 후보에 기록이 있을 때만(코퍼스 부재 시 소음 방지).
  assert((appSrc.match(/hasAnyPair/gi)||[]).length>=3,'0판 경고 조건부 배선 부재');
  for(const file of ['ord_ui_v20.css','ord_cockpit_v15.css']){
    const css=read(file);
    assert(css.includes('.v241-pair,.v241-solo{')&&css.includes('.v241-pair.none{'),`${file} 배지 스타일 부재`);
  }
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V24_1_0_PAIR_EVIDENCE ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
