'use strict';

// v23.5.0 계약 — 사용자 규칙(0818): "상위를 2개 이상 가면 특강을 한 명밖에
// 못 해주거든? 근데 상위 중에서 특강이 중요한 게 있고 별 차이 없는 게
// 있어서 특성공학이라는 항법을 먹으면 둘 다 올릴 수 있긴 한데, 별 차이
// 없는 상위가 있으면 다른 항법 먹어서 기대값 올리는 게 더 나으니까."
//
// 계약: ① navProfile — 특강 슬롯은 기본 1, 연합세력·특성공학만 2 (+노트)
//      ② specialTrainingProfile — desc 정본 표기 구조화: (필수)=required ·
//        (애매)=marginal · 정의줄만 있으면 listed · 정의줄 없으면 none
//        (파트너 언급 속 '특강x'는 정의줄이 아님 — 카이도), 조건부 단서는
//        note 로 보존(시키 '마딜은 특강 안 해도 잘 씀')
//      ③ specialTrainingAdvice — 둘 다 필수면 특성공학 권고 / 한쪽만
//        필수면 특강 대상 지정 + 다른 항법 기대값 권고 / 필수 없음이면
//        특성공학 불필요 권고.  특성공학이 이미 켜져 있으면 문구 전환.
//        상위 1기뿐이면 null (조언 전용 — 게이트·항법 자동 변경 없음)
//      ④ 앱 배선 — 파티 패널 조언 블록(.v235-st) + 2상위 확정 토스트

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,units=context.ORD_TMO_UNITS;
const find=(nm,grp)=>units.find(u=>String(u.name).includes(nm)&&String(u.groupName||'').includes(grp));

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① navProfile 특강 슬롯 — 기본 1, 특성공학만 2',()=>{
  assert.strictEqual(C.navProfile('none','').specialTrainingSlots,1,'미선택 슬롯은 1이어야');
  assert.strictEqual(C.navProfile('gambler','hedge').specialTrainingSlots,1,'도박광은 1이어야');
  assert.strictEqual(C.navProfile('union','ilseok').specialTrainingSlots,1,'연합세력 일석이조는 1이어야');
  const trait=C.navProfile('union','trait');
  assert.strictEqual(trait.specialTrainingSlots,2,'특성공학은 2여야');
  assert(trait.notes.some(note=>note.includes('특강 2기')),'특성공학 노트 부재 — 설정 화면에 안 뜬다');
});

test('② 특강 프로필 — 정본 표기 구조화',()=>{
  assert.strictEqual(C.specialTrainingProfile(find('도플라밍고','초월')).grade,'required','도플라밍고(필수) 판정 오류');
  assert.strictEqual(C.specialTrainingProfile(find('사보','초월')).grade,'required','사보(필수) 판정 오류');
  assert.strictEqual(C.specialTrainingProfile(find('마르코 (인간폼)','제한됨')).grade,'marginal','마르코(애매) 판정 오류');
  assert.strictEqual(C.specialTrainingProfile(find('빅맘','불멸')).grade,'listed','빅맘(정의줄만) 판정 오류');
  // 카이도 desc 의 특강 언급은 파트너 추천('쵸파초월(특강x)') 속 — 정의줄이 아니다.
  assert.strictEqual(C.specialTrainingProfile(find('카이도','불멸')).grade,'none','카이도는 정의줄이 없어 none 이어야');
  const shiki=C.specialTrainingProfile(find('시키','불멸'));
  assert.strictEqual(shiki.grade,'listed','시키 판정 오류');
  assert(shiki.note.includes('마딜은 특강 안 해도'),'시키 조건부 단서가 note 에 없다');
});

test('③ 조언 분기 — 둘다필수/한쪽필수/필수없음 × 특성공학 유무',()=>{
  const sabo=find('사보','초월'),oden=find('오뎅','영원'),bigmam=find('빅맘','불멸'),aokiji=find('아오키지','초월');
  const dual=C.specialTrainingAdvice(sabo,oden,{navFamily:'none',navPerk:''});
  assert.strictEqual(dual.kind,'dual-required');
  assert(dual.text.includes('특성공학'),'둘다필수+슬롯1이면 특성공학 권고가 있어야');
  const dualTrait=C.specialTrainingAdvice(sabo,oden,{navFamily:'union',navPerk:'trait'});
  assert.strictEqual(dualTrait.slots,2);
  assert(dualTrait.text.includes('둘 다 특강'),'특성공학이 켜져 있으면 둘 다 특강 안내여야');
  const single=C.specialTrainingAdvice(sabo,bigmam,{navFamily:'gambler',navPerk:'hedge'});
  assert.strictEqual(single.kind,'single-required');
  assert.strictEqual(single.targetId,String(sabo.id),'특강 대상은 필수 쪽(사보)이어야');
  assert(single.text.includes('사보')&&single.text.includes('다른 항법'),'한쪽필수면 대상 지정+다른 항법 권고여야');
  const none=C.specialTrainingAdvice(bigmam,aokiji,{navFamily:'none',navPerk:''});
  assert.strictEqual(none.kind,'none-required');
  assert(none.text.includes('특성공학 없이'),'필수없음+슬롯1이면 특성공학 불필요 권고여야');
  assert.strictEqual(C.specialTrainingAdvice(sabo,null,{}),null,'상위 1기면 조언 없음(null)이어야');
});

test('④ 앱 배선 — 파티 패널 조언 블록 + 확정 토스트 + CSS (소스 계약)',()=>{
  const app=read('ord_app.js');
  assert(app.includes('specialTrainingAdvice'),'앱이 조언 함수를 안 쓴다');
  assert(app.includes('v235-st'),'파티 패널 조언 블록(.v235-st) 부재');
  assert(/confirm-second-upper[\s\S]{0,900}specialTrainingAdvice/.test(app),'2상위 확정 핸들러에 조언 토스트 배선 부재');
  for(const file of ['ord_ui_v20.css','ord_cockpit_v15.css']){
    assert(read(file).includes('.v235-st'),`${file} 에 조언 스타일 부재`);
  }
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_5_0_SPECIAL_TRAINING_NAV ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);