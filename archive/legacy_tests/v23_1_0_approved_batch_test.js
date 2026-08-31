'use strict';
// v23.1.0 계약 — 협의 항목 3건 일괄 반영 (사용자: "남은 협의 항목 3개도
// 다 반영해줘").
//
// ① 새턴 화력 저주 산입 — bossPreview dpsNeed ÷0.7 (아군 공격력 -30%,
//    war3map.j 9400).  준비 96~98%에서 죽던 새턴 판을 화력 판정이 반영.
// ② 항법 상위 상한 강제 — 패왕의길 1기(2상위 경로 폐쇄) · 계엄령 0기
//    (상위 요구 면제 + 확정 차단).  upperSlotLimit·deficits·앱 확정 배선.
// ③ #60 광보잡 소수 인분 — 킬러·레드포스호 1 · 히바리 0.5 · 초월 우솝 2,
//    물딜 목표 2 → 1.5 (구상 3 + v22.11 실측 p50 1·p75 2 지지).

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const tests=[];
function test(name,fn){tests.push([name,fn]);}

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_clear_stats.js','ord_core.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_squad_planner.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,App=context.ORDApp.App;

test('① 새턴 화력 저주 — dpsNeed ÷0.7 + 저주 문구 산입 명시',()=>{
  const none=C.bossPreview(50,'none'),saturn=C.bossPreview(50,'saturn');
  assert.strictEqual(saturn.firepowerRetained,.7,'새턴 화력 잔존 계수 없음');
  assert.strictEqual(none.firepowerRetained,1,'무저주 계수가 1이 아니다');
  const ratio=saturn.dpsNeed/none.dpsNeed;
  assert(ratio>1.42&&ratio<1.44,`DPS 요구 배율 ${ratio} — 1/0.7 이 아니다`);
  // 신세계 보스도 동일 배율(체젠은 새턴 값이 별도 반영).
  const none60=C.bossPreview(60,'none'),saturn60=C.bossPreview(60,'saturn');
  assert(saturn60.dpsNeed>none60.dpsNeed,'신세계 새턴 DPS 요구가 오르지 않는다');
  assert(C.GOROSEI.saturn.curse.includes('산입'),'저주 문구가 산입을 밝히지 않는다');
});

test('② 항법 상위 상한 — upperSlotLimit·경로 폐쇄·면제·앱 확정 차단',()=>{
  assert.strictEqual(C.upperSlotLimit('dual',{navFamily:'conqueror',navPerk:''}),1,'패왕의길 dual 상한 1 실패');
  assert.strictEqual(C.upperSlotLimit('physical',{secondUpperId:'X',navFamily:'conqueror',navPerk:'martial'}),0,'계엄령 상한 0 실패');
  assert.strictEqual(C.upperSlotLimit('dual',{}),2,'항법 미선택 dual 상한 2 가 깨졌다');
  const st=C.normalizeState(context.ORD_TMO_UNITS,{counts:{'540h':1},currentAbilities:{}},{manualCounts:{}});
  const spec=C.currentSpec(st,'magic',{});
  // 패왕의길: dual 요청이 singleEnd 로 강제 전환 + 사유 명시.
  const capped=C.deficits(spec,'magic',{gorosei:'none',magicRoute:'dual',navFamily:'conqueror',navPerk:''});
  assert.strictEqual(capped.profile.key,'singleEnd','패왕의길에서 dual 이 살아 있다');
  assert(capped.profile.note.includes('패왕의길'),'경로 폐쇄 사유 문구 없음');
  // 계엄령: 상위 요구 면제가 최상위 요구 원장까지 관철.
  const martial=C.deficits(spec,'magic',{gorosei:'none',magicRoute:'singleEnd',navFamily:'conqueror',navPerk:'martial'});
  const main=(martial.requirements||[]).find(row=>row.key==='main');
  assert(main&&main.waived===true&&main.required===false,'계엄령 상위 면제가 원장에 없다');
  const martialPhysical=C.deficits(C.currentSpec(st,'physical',{}),'physical',{gorosei:'none',navFamily:'conqueror',navPerk:'martial'});
  const mainP=(martialPhysical.requirements||[]).find(row=>row.key==='main');
  assert(mainP&&mainP.waived===true,'물딜 계엄령 상위 면제가 없다');
  // 앱: 계엄령 확정 차단 + 패왕의길 2상위 차단 + 처방 봉쇄 (소스 배선).
  const app=read('ord_app.js');
  assert(app.includes('계엄령 항법 — 최상위 조합이 불가합니다'),'계엄령 확정 차단 토스트 없음');
  assert(app.includes('패왕의길 항법 — 최상위는 1기만'),'패왕의길 2상위 차단 토스트 없음');
  assert(app.includes('if(navCap!=null&&navCap<=1)return[];'),'2상위 처방 봉쇄 없음');
});

test('③ 광보잡 소수 인분 — 가중치·합산·물딜 목표 1.5',()=>{
  assert.deepStrictEqual(JSON.parse(JSON.stringify(C.BOSS_FRENZY_WEIGHTS)),{MC0h:.5,B90H:2},'가중치 표가 구상 3 과 다르다');
  const db=C.buildDb(context.ORD_TMO_UNITS);
  const credit=id=>{const u=db.byId.get(id);return C.roleContribution(u,'physical').bossFrenzy;};
  assert.strictEqual(credit('540h'),1,'킬러 1인분 아님');
  assert.strictEqual(credit('MC0h'),.5,'히바리 0.5인분 아님');
  assert.strictEqual(credit('U30h'),1,'레드포스호 1인분 아님');
  assert.strictEqual(credit('B90H'),2,'초월 우솝 2인분 아님');
  const st=C.normalizeState(context.ORD_TMO_UNITS,{counts:{'540h':1,'MC0h':1},currentAbilities:{}},{manualCounts:{}});
  const spec=C.currentSpec(st,'physical',{});
  assert.strictEqual(spec.bossFrenzy,1.5,`킬러+히바리 합산 ${spec.bossFrenzy} ≠ 1.5`);
  const d=C.deficits(spec,'physical',{gorosei:'none'});
  const row=(d.requirements||[]).find(r=>r.key==='bossFrenzy');
  assert(row&&row.target===1.5&&/1\.5/.test(row.label),'물딜 광보잡 목표가 1.5 가 아니다');
  assert.strictEqual(row.gap,0,'킬러+히바리(1.5)가 목표를 못 채운다');
  // 마딜 목표 1 은 불변 (구상 3: 라인딜 1인분 · 단끝 1기).
  const md=C.deficits(C.currentSpec(st,'magic',{}),'magic',{gorosei:'none',magicRoute:'singleEnd'});
  const mrow=(md.requirements||[]).find(r=>r.key==='bossFrenzy');
  assert(mrow&&mrow.target===1,'마딜 광보잡 목표 1 이 흔들렸다');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_1_0_APPROVED_BATCH ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
