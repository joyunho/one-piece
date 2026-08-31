'use strict';

// v19.5(사용자 요청): "메모장 참고해서 추천 엔진이랑 상위 표기할 때 특징
// 간단 요약해서 뭘 같이 써주면 좋은지 어떻게 활용해야 하는지 간단하게
// 화면에 나올 수 있도록" — 전수 메모 기반 상위 플레이북의 배선 고정.
//
//   ① 데이터: 카탈로그의 모든 상위가 요약(≤60)·활용(≤70)·페어(2~4)를 갖는다.
//   ② 배포 3종(확장 helper·수동 번들 빌더·UI 픽스처)에 전부 실린다.
//   ③ 화면 5곳(후보 카드·확정 메인 카드·2상위·저격 모달·상세 모달)에 붙는다.
//   ④ 표시 전용 경계: 엔진·플래너·워커는 이 데이터를 참조하지 않는다.

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const read=name=>fs.readFileSync(path.join(EXT,name),'utf8');
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}

const context={console};context.window=context;vm.createContext(context);
for(const file of ['ord_units_data.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,units=context.ORD_TMO_UNITS,book=context.ORD_UPPER_PLAYBOOK;

check('카탈로그 상위 전원이 요약·활용·페어를 가진다',()=>{
  const uppers=units.filter(C.isUpper);
  assert(uppers.length>=70,`상위 수가 이상함: ${uppers.length}`);
  assert(book&&book.byId&&book.version,'플레이북 전역이 없음');
  for(const unit of uppers){
    const entry=book.byId[unit.id];
    assert(entry,`플레이북 누락: ${unit.id} (${unit.name})`);
    assert(typeof entry.summary==='string'&&entry.summary.length>0&&entry.summary.length<=60,`요약 길이 위반: ${unit.id}`);
    assert(typeof entry.use==='string'&&entry.use.length>0&&entry.use.length<=70,`활용 길이 위반: ${unit.id}`);
    assert(Array.isArray(entry.pairs)&&entry.pairs.length>=2&&entry.pairs.length<=4,`페어 수 위반: ${unit.id}`);
    for(const name of entry.pairs)assert(typeof name==='string'&&name.length>0&&name.length<=12,`페어 이름 위반: ${unit.id} -> ${name}`);
  }
  // 카탈로그에 없는 유령 항목도 금지 — 데이터가 낡으면 여기서 드러난다.
  const ids=new Set(units.map(unit=>String(unit.id)));
  for(const id of Object.keys(book.byId))assert(ids.has(id),`카탈로그에 없는 플레이북 항목: ${id}`);
});

check('v2 처방 필드 — 축·부족 핵심·운영·추천 2상위·주의가 전원 채워져 있다',()=>{
  // v19.7(사용자 요청 ③⑤): 63키트 처방 데이터팩 통합.
  const upperIds=new Set(units.filter(C.isUpper).map(unit=>String(unit.id)));
  for(const [id,entry] of Object.entries(book.byId)){
    assert(Array.isArray(entry.axis)&&entry.axis.length>=1&&entry.axis.length<=3&&entry.axis.every(item=>item.length<=10),`axis 위반: ${id}`);
    assert(Array.isArray(entry.missingCore)&&entry.missingCore.length>=1&&entry.missingCore.length<=3&&entry.missingCore.every(item=>item.length<=16),`missingCore 위반: ${id}`);
    assert(typeof entry.op==='string'&&entry.op.length>0&&entry.op.length<=70,`op 위반: ${id}`);
    assert(Array.isArray(entry.avoid)&&entry.avoid.length<=2&&entry.avoid.every(item=>item.length<=40),`avoid 위반: ${id}`);
    assert(Array.isArray(entry.second)&&entry.second.length===3,`second 수 위반: ${id}`);
    for(const rec of entry.second){
      assert(upperIds.has(String(rec.id)),`second 유령 id: ${id} -> ${rec.id}`);
      assert(String(rec.id)!==String(id),`second 자기 자신: ${id}`);
      assert(rec.name&&rec.name.length<=12&&rec.why&&rec.why.length<=40,`second 텍스트 위반: ${id}`);
    }
  }
});

check('③⑤ 화면 배선 — 확정 설명 카드와 2상위 처방·희귀 겹침 표시',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes('function playbookDirectionHtml('),'방향 확정 카드 렌더러 없음');
  assert(app.includes('${playbookDirectionHtml(upper)}'),'확정 메인 카드가 방향 설명을 안 씀');
  assert(app.includes('파티가 채울 것'),'부족 핵심 라벨 없음');
  assert(app.includes("label:'처방 추천'"),'2상위 처방 후보 주입 없음');
  assert(app.includes('메인과 희귀 겹침'),'희귀 겹침 표시 없음');
  const css=fs.readFileSync(path.join(EXT,'ord_ui_v20.css'),'utf8');
  assert(css.includes('.v155-playbook .row')&&css.includes('v157-direction'),'방향 카드 스타일 없음');
});

check('배포 대상 3종에 전부 실린다',()=>{
  const helper=read('ord_helper.html');
  assert(helper.includes('ord_upper_playbook.js'),'확장 helper 미탑재');
  assert(helper.indexOf('ord_upper_playbook.js')<helper.indexOf('ord_app.js'),'앱보다 늦게 로드됨');
  const builder=fs.readFileSync(path.join(EXT,'tools/build_manual.js'),'utf8');
  assert(builder.includes("'ord_upper_playbook.js'"),'수동 번들 빌더 미탑재');
  const fixture=fs.readFileSync(path.join(__dirname,'ui_fixture.html'),'utf8');
  assert(fixture.includes('ord_upper_playbook.js'),'UI 픽스처 미탑재');
});

check('상위가 보이는 화면 5곳에 붙는다',()=>{
  const app=read('ord_app.js');
  assert(app.includes('function upperPlaybookOf(')&&app.includes('function playbookHtml('),'플레이북 렌더 헬퍼가 없음');
  // 후보 카드(5번 패널 · 상위 미확정): 이유 문장 옆에 컴팩트 요약.
  assert(/reason\|\|'상위와 보조 전설급을 같은 파티로 평가합니다\.'\)\}<\/p>\$\{playbookHtml\(/.test(app),'후보 카드에 플레이북이 없음');
  // 확정 메인 상위 카드: v19.7부터 방향 확정 설명 카드(축·부족·운영)로 승격.
  assert(app.includes('저격</button></div>${playbookDirectionHtml(upper)}'),'확정 메인 카드에 플레이북이 없음');
  // 2상위: 확정 블록과 후보 행 양쪽.
  assert(app.includes('바뀌지 않습니다</small>${playbookHtml(confirmedSecond,'),'확정 2상위에 플레이북이 없음');
  assert(app.includes('${playbookHtml(row.unit,{compact:true,maxPairs:3})}'),'2상위 후보 행에 플레이북이 없음');
  // 저격 모달: 요약 한 줄(페어 생략).
  assert(app.includes('${playbookHtml(row.unit,{compact:true,maxPairs:0})}'),'저격 모달에 플레이북이 없음');
  // 상세 모달: 전용 섹션.
  assert(app.includes('playbook-detail'),'상세 모달 플레이북 섹션이 없음');
  // CSS 가 실제로 존재한다.
  const css=read('ord_ui_v20.css');
  assert(css.includes('.v155-playbook')&&css.includes('.playbook-detail'),'플레이북 스타일이 없음');
});

check('표시 전용 경계 — 엔진 계열은 플레이북을 모른다',()=>{
  for(const file of ['ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_direction_worker.js','ord_run_log.js','ord_run_log_compactor.js']){
    assert(!read(file).includes('ORD_UPPER_PLAYBOOK'),`${file} 이 플레이북을 참조함`);
  }
});

console.log(`\n${checks}/${checks} upper playbook checks passed.`);
