'use strict';

// v27.0.0 계약 — 2.314 카탈로그 전면 재검증 (사용자 0826g).
//
// 사용자: "상위에 s 스네이크 이런녀석들은 왜있냐 제대로 확인해주고
// 변화된 유닛들도 뭔가 스펙이 이상해 이제 베이비 5는 광보잡이 아니고
// 뭐 이런거 있거든? 싹다 유닛들 다시 확인해줘 2.314버전으로"
//
// 정본: 공식 누적 패치노트(dcinside ordc1 no=189308 — 2.314 전문, 2.313
// 결번) + 2.312R 맵 전수문서화 원문.  게시 카탈로그(api.tmo.gg/posts/41824)
// 는 2.312 에서 멈췄고 2.314 는 조합식 무변 — 손패치는 ord_data_patch.js
// patch2314 레이어.
//
// ① 세라핌은 상위가 아니다 — 기준 상위 선택지·검색·2상위 페어·TOP3 에서
//    제외(동반 전설 top8 자리는 유지).
// ② (변화)베이비5 — 광보잡 아님(2.310 공식: 보스·광폭 추가딜 삭제 + 범위
//    암브 1): 카탈로그 플래그·역할·메모 전부 광보잡 잔재 0.
// ③ 변화·왜곡 스펙 재검증 — 도플 단일0.5, 캐럿 폭뎀증 램프25, 페로나
//    폭뎀증10 (맵 원문 승격).
// ④ 2.314 공식 패치 반영 — 미나토 마뎀증→마방깎 역할 이동 + desc 마커.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_clear_stats.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,App=context.ORDApp.App,units=context.ORD_TMO_UNITS;
const byId=id=>units.find(u=>u.id===id);
const richCounts=(()=>{const counts={};for(const u of units)if(['common','uncommon','special'].includes(C.tierKey(u)))counts[u.id]=2;counts[C.WISP_ID]=8;return counts;})();
const richState=C.normalizeState(units,{counts:richCounts,currentAbilities:{}},{manualCounts:{}});
const mkApp=()=>{
  const app=Object.create(App.prototype);
  app.state={mode:'magic',magicRoute:'auto',locks:[],currentRound:20,rerollsUsed:0,navFamily:'none',navPerk:'',transcendUsed:0,seraphUsed:0,changedUsed:0,snapshot:null,secondUpperId:'',v26Filter:'',v26PickId:'',v26ComboUpperId:'',v26Page:0,v26ComboSearch:'',superKumaOwned:true,story10Reward:'',pendingReroll:null};
  app.upperLock=()=>null;
  app.actualRound=()=>20;
  return app;
};
const SERAPH_NAMES=['S-스네이크','S-호크','S-샤크','S-베어'];

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① 세라핌은 상위가 아니다 — 선택지·검색·페어·TOP3 제외, 동반 자리는 유지',()=>{
  const app=mkApp();
  app.state.mode='';
  const html=app.renderV26Combos(richState);
  // 기준 상위 select 옵션에 세라핌 부재.
  const optionsBlock=html.slice(html.indexOf('<select'),html.indexOf('</select>'));
  for(const name of SERAPH_NAMES)assert(!optionsBlock.includes(name),`상위 선택지에 세라핌: ${name}`);
  // 검색이 세라핌을 찾아주지 않는다.
  const sApp=mkApp();sApp.state.mode='';sApp.state.v26ComboSearch='S-';
  const sHtml=sApp.renderV26Combos(richState);
  const foundBlock=sHtml.includes('v26-combo-found')?sHtml.slice(sHtml.indexOf('v26-combo-found')):'';
  for(const name of SERAPH_NAMES)assert(!foundBlock.includes(name),`상위 검색이 세라핌을 찾음: ${name}`);
  // TOP3 후보에 세라핌 없음 (db.uppers 자체가 세라핌 미포함 — 회귀 핀).
  for(const pick of app.v26UpperPicks(richState))assert(!C.isSeraph(pick.unit),`TOP3 에 세라핌: ${pick.unit.name}`);
  assert(!richState.db.uppers.some(u=>C.isSeraph(u)),'db.uppers 에 세라핌이 들어왔다');
  // 페어(2상위) 축에도 세라핌 부재: 페어 데이터가 가장 많은 상위를 골라 검증.
  const best=richState.db.uppers.map(u=>({u,g:C.num((C.clearStatsFor(u.id)||{}).games)})).sort((a,b)=>b.g-a.g)[0];
  const pApp=mkApp();pApp.state.mode='';pApp.state.v26ComboUpperId=best.u.id;
  const pHtml=pApp.renderV26Combos(richState);
  const pairsAt=pHtml.indexOf('v26-pairs');
  if(pairsAt>=0){
    const pairsBlock=pHtml.slice(pairsAt);
    for(const name of SERAPH_NAMES)assert(!pairsBlock.slice(0,pairsBlock.indexOf('</div>')).includes(name),`2상위 페어에 세라핌: ${name}`);
  }
  // 동반 전설 top8(파트너) 자리는 세라핌 유지 — 실측을 지우지 않는다
  // (세라핌을 파트너로 가진 상위가 코퍼스에 존재해야 의미 — 존재 확인).
  const partnered=richState.db.uppers.some(u=>{
    const st=C.clearStatsFor(u.id);
    return st&&(st.partners||[]).some(p=>SERAPH_NAMES.some(n=>String(p.name||'').includes(n)));
  });
  assert(partnered,'클리어 코퍼스 동반 전설에서 세라핌이 통째로 사라졌다 — 제외 범위 과잉');
});

test('② (변화)베이비5 — 광보잡 잔재 0: 카탈로그 플래그·역할·메모·표기',()=>{
  const unit=byId('N70h');
  assert(unit,'N70h 부재');
  // 카탈로그 층: patch2314 가 잔존 플래그를 명시 false 로 지운다.
  assert.strictEqual(unit.abilities['보스 잡기'],false,'카탈로그 보스 잡기 플래그 잔존');
  assert.strictEqual(unit.abilities['광폭화'],false,'카탈로그 광폭화 플래그 잔존');
  assert.strictEqual(C.num(unit.abilities['아머브레이크']),1,'2.310 공식 암브 1 이 사라졌다');
  // 역할 층: 광보잡 아님 + 암브 유닛.
  const role=C.roleProfile(unit);
  assert(!role.boss&&!role.frenzy,'roleProfile 이 베이비5 를 광보잡으로 센다');
  assert(role.armorBreak,'roleProfile 암브 소실');
  const mech=C.skillFacts(unit).mechanics.map(m=>m.label);
  assert(!mech.includes('광보잡')&&!mech.includes('보잡'),`상세 표기에 광보잡: ${mech}`);
  assert(mech.includes('아머브레이크'),'상세 표기에 아머브레이크 부재');
  // 메모(참고 파티·전수 플레이북) 층: 2.305 시대 "보잡, 광보잡" 스펙 잔재 0.
  for(const memoKey of ['ORD_UPPER_MEMO','ORD_SYNERGY_MEMO']){
    for(const entry of context[memoKey]&&context[memoKey].entries||[]){
      for(const support of entry.supports||[]){
        if(!/^베이비 5$/.test(String(support.name||'')))continue;
        assert(!/광보잡/.test(String(support.specs||'')),`${memoKey} ${entry.name} 베이비5 specs 에 광보잡 잔재`);
        assert(!/^보잡, 광보잡/.test(String(support.reinforce||'')),`${memoKey} ${entry.name} 베이비5 reinforce 머리말 잔재`);
      }
    }
  }
});

test('③ 변화·왜곡 스펙 재검증 — 맵 원문 승격 수치',()=>{
  // 도플라밍고(변화): 단일 0.6 → 0.5 (공식 도우미·감자 합치 + 2.310 마법 전환).
  const dofla=byId('S50h');
  assert.strictEqual(C.roleProfile(dofla).single,0.5,'도플라밍고(변화) 단일 0.5 아님');
  assert(/단일0\.5/.test(dofla.name),'도플라밍고(변화) 이름 표기 미교정');
  // 캐럿(변화): 일렉트리컬 루나 폭뎀증 1%/타 램프, 최대 25 — 축은 상한 25.
  const carrot=byId('J70h');
  assert.strictEqual(C.roleProfile(carrot).explosionAmp,25,'캐럿(변화) 폭뎀증 25 아님');
  assert(/램프25/.test(carrot.name),'캐럿(변화) 램프 표기 부재');
  assert(String(carrot.desc||'').includes('최대 25%'),'캐럿(변화) 램프 desc 부재');
  // 페로나(왜곡): 자기 라인존 폭뎀증 10% — 불리언 표기의 실수치 승격.
  assert.strictEqual(C.roleProfile(byId('840h')).explosionAmp,10,'페로나(왜곡) 폭뎀증 10 아님');
  // 카쿠(변화): 맵 원문 desc(끝딜 0.5 산입 근거) 명시.
  assert(String(byId('KC0h').desc||'').includes('람각'),'카쿠(변화) 맵 원문 desc 부재');
});

test('④ 2.314 공식 패치 반영 — 미나토 역할 이동 + desc 마커 전수',()=>{
  // 미나토(신비): 마뎀증 3 → 마방깎 3 (2.314 툴팁 정정 = 실적용).
  const minato=byId('unit_1761062663657_987');
  const role=C.roleProfile(minato);
  assert.strictEqual(role.magicAmp,0,'미나토 마뎀증이 아직 산입된다');
  assert.strictEqual(role.magicDef,3,'미나토 마방깎 3 부재');
  assert(/마방깎3/.test(minato.name),'미나토 이름 표기 미교정');
  // 2.314 desc 마커 — 공식 노트의 역할 무관 항목이 유닛에 기록됐는지 전수.
  const marked=['E30h','unit_1752901441310_3608','B30h','X30h','790H','OC0H','C40h','760h','C50h','KB0H','KB0H_','480h','040h','S10h','L20h','C20h','unit_1761062663657_987','N70h'];
  for(const id of marked)assert(String((byId(id)||{}).desc||'').includes('2.314'),`2.314 desc 마커 부재: ${id}`);
  assert(units.filter(u=>String(u.desc||'').includes('2.314')).length>=marked.length,'2.314 마커 수 미달');
});

let pass=0,fail=0;
for(const [name,fn] of tests){
  try{fn();console.log('PASS',name);pass++;}
  catch(error){console.log('FAIL',name);console.log(String(error&&error.message||error));fail++;}
}
console.log(`V27_0_0_CATALOG_2314 ${pass}/${tests.length} passed`);
if(fail)process.exit(1);
