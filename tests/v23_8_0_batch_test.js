'use strict';

// v23.8.0 계약 — 사용자 5건(0819):
// ① "우선 너무 느려 갱신이" — HUD 급전을 1.5초 고정 주기에서 스냅샷
//    직후 즉시 push + 400ms 보조 주기(전문 비교로 무변경 전송 생략)로.
// ② "첫 전설급 유닛을 뽑을 때 스토리 등급이 E 이하인 유닛은 추천 금지"
//    — 전설급 리그 E·F 밴드는 firstFinal 후보에서 제외.
// ③ "스택이 있어서 빨리 올려야 하는 상위 — 시라호시 초월·료쿠규 초월·
//    빅맘 등" — 스택형 상위 데이터 + 후보·확정·2상위 배지.
// ④ "리롤 추천을 너무 못하는 것 같아" — '희귀→전설 즉시 제작 가능'만
//    있는(그 전설이 확정 계획 밖인) 희귀는 적극 항법에서 리롤 허용.
// ⑤ "배포도 생각중이라 처음 보는 사람도 쉽게" — 첫 실행 가이드 +
//    설정의 다시 열기 버튼 + README 퀵스타트.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_core.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,units=context.ORD_TMO_UNITS;
const byId=id=>units.find(u=>String(u.id)===id);

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① HUD 즉시 갱신 — 스냅샷 직후 push + 400ms 변경 감지 주기',()=>{
  const boot=read('ord_boot_desktop.js');
  assert(boot.includes('window.__ORD_HUD_PUSH = pushHud'),'push 함수 전역 노출 부재');
  assert(boot.includes('setInterval(pushHud, 400)'),'400ms 보조 주기 부재');
  assert(boot.includes('if (sig === lastHudSig) return'),'무변경 전송 생략 가드 부재');
  assert(boot.includes('setTimeout(window.__ORD_HUD_PUSH, 60)'),'스냅샷 직후 즉시 push 부재');
  assert(!boot.includes('}, 1500);'),'구 1.5초 주기가 남아 있다');
});

test('② 첫 전설 E·F 밴드 제외 — 데이터 근거 + 엔진 필터',()=>{
  const grade=u=>C.storyLeagueGrade(u,C.storyGrade(u));
  assert.strictEqual(grade(byId('T30h')).leagueTier,'F','레베카는 F 밴드여야');
  assert.strictEqual(grade(byId('780h')).leagueTier,'E','토키는 E 밴드여야');
  assert.strictEqual(grade(byId('430h')).leagueTier,'B','상디는 B — 제외 대상 아님');
  const engine=read('ord_v15_engine.js');
  assert(engine.includes('function firstFinalStoryTooSlow(unit)'),'판정 함수 부재');
  assert(engine.includes("milestoneSpec.key==='firstFinal'&&firstFinalStoryTooSlow(item.unit)"),'firstFinal 필터 배선 부재');
  assert(engine.includes('lg.leagueRanked&&/^[EF]$/'),'E·F 밴드 판정식 부재(미측정 유닛은 제외하지 않는 계약)');
});

test('③ 스택형 상위 — 데이터 + 배지 배선',()=>{
  for(const id of ['U80H','LB0H','Q40h'])assert(C.isStackRampUpper(byId(id)),`${id} 스택형 판정 실패`);
  assert(!C.isStackRampUpper(byId('V80H')),'나미(비스택)가 스택형으로 오판');
  const app=read('ord_app.js');
  const spots=(app.match(/v238-stack/g)||[]).length;
  assert(spots>=3,`배지 배선이 ${spots}곳뿐 — 후보·확정 헤더·2상위·선택 카드 중 3곳 이상 필요`);
  assert(app.includes('스택형 — 제작을 미루면 손해'),'확정 상위 재촉 문구 부재');
});

test('④ 리롤 — 계획 밖 craftable 희귀는 적극 항법에서 리롤 허용',()=>{
  const app=read('ord_app.js');
  assert(app.includes('const weakDestOnly=row=>'),'약한 목적지 판정 부재');
  assert(app.includes("item.source==='craftable'&&!planLineupIds.has(String(item.unitId))"),'계획 밖 craftable 판정식 부재');
  assert(app.includes('navReroll.aggressiveReroll&&weakDestOnly(row)'),'적극 항법 한정 조건 부재 — 기본 항법 교집합 계약(v19.10) 보호');
  assert(app.includes('희귀→전설 즉시 제작은 가능하나 확정 계획 밖 — 리롤 허용(적극 항법)'),'정직한 사유 문구 부재');
});

test('⑤ 온보딩 — 첫 실행 가이드 + 재열기 + README 퀵스타트',()=>{
  const app=read('ord_app.js');
  assert(app.includes('renderV238Onboarding()'),'가이드 렌더 부재');
  assert(app.includes("if(a==='dismiss-onboarding')")&&app.includes("if(a==='show-onboarding')"),'가이드 열기/닫기 핸들러 부재');
  assert(app.includes('onboardingSeen:false,'),'DEFAULTS 온보딩 플래그 부재');
  assert(app.includes('onboardingSeen:this.state.onboardingSeen===true'),'새 게임 리셋에서 가이드 재노출 방지 부재');
  assert(app.includes('data-act="show-onboarding"'),'설정의 다시 열기 버튼 부재');
  const readme=fs.readFileSync(path.join(__dirname,'..','README.txt'),'utf8');
  assert(readme.includes('처음이라면 — 3단계'),'README 퀵스타트 부재');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_8_0_BATCH ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);