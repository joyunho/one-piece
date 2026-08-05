'use strict';
// v19.17.0 계약 — A급 2건: 전제 승격(A2) + 클리어 실측 파트너 반영(A1).
//
// 배경(0805 키드 63라 라인사): "체젠필수" 상위인데 전략 필수(체젠 2)가
// 정적 경로 그룹에 키가 없다는 이유로 늘 꼬리 그룹에 앉아, 빔 탐색·회복
// 목표·보조 정렬 전부가 단끝 조각을 먼저 채웠다(최종 체젠 0.45/2).
// 또한 클리어 실측 91,833판이 말하는 파트너(키드 ↔ 모비딕호 60.9%)가
// 보조 추천 순위에 전혀 반영되지 않았다.
//
// ① A2 삽입 규칙 — 전제 그룹은 화력만의 그룹 앞, 생존 합류 그룹은 불침.
// ② A2 정책 그룹 — groupRows 실행: regen 전제가 단끝 그룹보다 앞 인덱스.
// ③ A2 행동 재현 — 0805L r63 리플레이: 회복 목표 1순위가 체젠.
// ④ A1 파트너 지분 — partnerShareFor 실측값 + 게이트·목표 불변 경계.
// ⑤ A1 배선 — 엔진 타이브레이크 위치·블루프린트 보조·앱 칩·리플레이 lib.
const assert=require('assert'),fs=require('fs'),path=require('path');
const lib=require('./lib/ordlog_replay.js');
const ROOT=path.join(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(EXT,file),'utf8');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

const engine=lib.loadEngine();
const C=global.ORDCore,P=global.ORDV15Policy;
const catalog=global.ORD_TMO_UNITS;

check('① 전제 그룹 삽입 규칙 — 화력 그룹 앞, 생존 합류 그룹 불침',()=>{
  // singleEnd 정순: 전제(regen)는 이감 뒤·단끝 앞.
  assert.deepStrictEqual(
    C.insertMechanicPriorityGroup([['main'],['bossFrenzy','stunBase'],['slow'],['singleEndExpected','single','end'],['stunFull']],['regen']),
    [['main'],['bossFrenzy','stunBase'],['slow'],['regen'],['singleEndExpected','single','end'],['stunFull']]);
  // 물딜: 화력 전용 그룹은 stunFull 뿐 — 전제는 그 앞.
  assert.deepStrictEqual(
    C.insertMechanicPriorityGroup([['main'],['armor','stunBase'],['slow','bossFrenzy'],['stunFull']],['speed','armorBreak']),
    [['main'],['armor','stunBase'],['slow','bossFrenzy'],['speed','armorBreak'],['stunFull']]);
  // 구제 모드(스턴 조기 합류): stunFull이 생존 키와 섞인 그룹은 화력
  // 그룹이 아니다 — 그 앞에 끼어들면 생존보다 전제가 앞서게 된다.
  assert.deepStrictEqual(
    C.insertMechanicPriorityGroup([['main'],['armor','stunBase','stunFull'],['slow','bossFrenzy']],['speed']),
    [['main'],['armor','stunBase','stunFull'],['slow','bossFrenzy'],['speed']]);
  // 이미 그룹에 있는 키·빈 목록은 무변형.
  const base=[['main'],['stunFull']];
  assert.strictEqual(C.insertMechanicPriorityGroup(base,[]),base);
  assert.deepStrictEqual(C.insertMechanicPriorityGroup([['main'],['regen'],['stunFull']],['regen']),[['main'],['regen'],['stunFull']]);
  // mechanic 키 추출 — required·mechanic 행만, meta 중첩(플래너)도 인식.
  assert.deepStrictEqual(
    C.mechanicRequirementKeys([{key:'regen',required:true,mechanic:true},{key:'speed',required:true,meta:{mechanic:true}},{key:'slow',required:true},{key:'subdamage',required:false,mechanic:true}]),
    ['regen','speed']);
});

check('② 정책 groupRows — regen 전제 그룹이 단끝 그룹보다 앞',()=>{
  const row=(key,label,current,target,extra)=>Object.assign({key,label,current,target,gap:Math.max(0,target-current),weight:60,required:true,status:'bad'},extra||{});
  const role={deficits:{requirements:[
    row('main','상위',1,1),row('bossFrenzy','광보잡',1,1),row('stunBase','최소 스턴',.7,.7),
    row('slow','이감',110,102),row('stunFull','1.5스턴',1.5,1.5,{meta:{fillLast:true}}),
    // 0805 실측 모양: 단끝 그룹의 세 키 모두 실행에 착수된 상태(이진
    // 미착수 부양 없음)에서 전제만 크게 열려 있다.
    row('singleEndExpected','안정 단끝',2.5,3),row('single','단일딜 환산 2',1.5,2),row('end','끝딜',1,1),
    row('regen','체젠 버프',0,2,{mechanic:true,reason:'체젠 비례 스킬 조건'})
  ]}};
  for(const round of [45,55]){
    const groups=P._test.groupRows(P.ROUTES.singleEnd,role,P.checkpointFor(round),round);
    const indexOf=key=>groups.findIndex(group=>group.keys.includes(key));
    assert(indexOf('regen')>=0,`r${round}: regen 그룹 없음`);
    assert(indexOf('regen')<indexOf('singleEndExpected'),`r${round}: 전제(${indexOf('regen')})가 단끝(${indexOf('singleEndExpected')}) 뒤`);
    assert(indexOf('regen')>indexOf('main'),`r${round}: 전제가 상위 그룹보다 앞`);
    assert.strictEqual(groups.length-1,indexOf('stunFull'),`r${round}: 1.5스턴이 마지막 그룹이 아님`);
  }
});

check('③ 0805L r63 행동 재현 — 회복 목표 1순위가 체젠',()=>{
  const run=lib.loadRun('0805L');
  const step=run.rounds.find(item=>item.round===63);
  assert(step,'0805L에 r63 없음');
  const decision=engine.decide({catalog,snapshot:step.snapshot,settings:step.settings,locks:step.locks});
  const targets=decision.recovery&&decision.recovery.targets||[];
  assert(targets.length>=2,`회복 목표 부족 (${targets.length})`);
  assert.strictEqual(targets[0].roleKey,'regen',`1순위가 체젠이 아님: ${targets.map(t=>t.roleKey).join(',')}`);
  const fireIndex=targets.findIndex(t=>/single|end/.test(t.roleKey));
  assert(fireIndex>0,'단끝 회복 목표가 사라짐 — 전제 승격은 화력 포기가 아니다');
  // 평가 행에도 그룹 우선순위가 실린다 — regen 그룹이 단끝 그룹보다 앞.
  const reqs=decision.assessment&&decision.assessment.requirements||[];
  const regen=reqs.find(r=>r.key==='regen'),fire=reqs.find(r=>r.key==='singleEndExpected');
  assert(regen&&fire&&C.num(regen.priority)<C.num(fire.priority),`priority 역전: regen p${regen&&regen.priority} vs 단끝 p${fire&&fire.priority}`);
});

check('④ 파트너 지분 — 키드↔모비딕호 실측 + 게이트·목표 불변 경계',()=>{
  // 클리어 실측: 키드 1,795판의 파트너 1위 모비딕호 (~60.9%).
  const share=C.partnerShareFor('4B0H','Q30h');
  assert(share>50,`키드↔모비딕호 지분 이상: ${share}`);
  assert.strictEqual(C.partnerShareFor('4B0H','no-such-id'),0);
  assert.strictEqual(C.partnerShareFor(null,'Q30h'),0);
  // purpose 경계: 실측은 표시·타이브레이크 전용 — 데이터에 명시돼 있다.
  assert(String(global.ORD_CLEAR_STATS.purpose).includes('게이트·목표 자동 교체 금지'),'purpose 경계 소실');
});

check('⑤ 배선 — 엔진 타이브레이크 위치·블루프린트·회복 정렬·앱 칩·lib',()=>{
  const engineSrc=read('ord_v15_engine.js');
  // supportUniverse: 파트너 지분은 역할 벡터(fullVector)·잠재 점수 뒤의
  // 타이브레이크다 — 앞이면 실측이 역할 수학을 이기게 된다(경계 위반).
  const sortSeg=engineSrc.slice(engineSrc.indexOf('rows.sort((left,right)=>P.compareVector(left.after.fullVector'));
  const fullVectorAt=sortSeg.indexOf('fullVector'),potentialAt=sortSeg.indexOf('potential'),shareAt=sortSeg.indexOf('partnerShare');
  assert(fullVectorAt>=0&&potentialAt>fullVectorAt&&shareAt>potentialAt,'supportUniverse 타이브레이크 순서 위반');
  assert(engineSrc.includes('partnerShare(right.unit)-partnerShare(left.unit)'),'supportUniverse 파트너 타이브레이크 없음');
  // blueprintSupportRows: 메모(전수 근거) → 파트너 지분 → 계획 순서.
  assert(engineSrc.includes('Number(right.memoMatched)-Number(left.memoMatched)||(left.memoRank||999)-(right.memoRank||999)||num(right.partnerShare)-num(left.partnerShare)'),'블루프린트 보조 파트너 타이브레이크 없음');
  // recoveryPlan: 정책 그룹 priority 정렬.
  assert(engineSrc.includes(".sort((a,b)=>(num(a.priority)||99)-(num(b.priority)||99))"),'회복 목표 그룹 정렬 없음');
  // core: 보조 fold 정렬 타이브레이크 + 행 부착.
  const coreSrc=read('ord_core.js');
  assert(coreSrc.includes('metaPartnerShare:partnerShareFor(upper.id,row.unit)'),'보조 fold 파트너 부착 없음');
  assert(coreSrc.includes('num(a.metaPartnerShare)!==num(b.metaPartnerShare)'),'compareSupportRows 파트너 타이브레이크 없음');
  // 플래너: 빔 우선순위 벡터에 전제 그룹 삽입.
  const plannerSrc=read('ord_squad_planner.js');
  assert(plannerSrc.includes('C.insertMechanicPriorityGroup(baseGroups,C.mechanicRequirementKeys(rows))'),'빔 벡터 전제 그룹 삽입 없음');
  // 앱: 다음 보조 fold 칩.
  const appSrc=read('ord_app.js');
  assert(appSrc.includes('클리어 실측 파트너')&&appSrc.includes('v1917-partner'),'앱 파트너 칩 없음');
  assert(fs.readFileSync(path.join(EXT,'ord_cockpit_v15.css'),'utf8').includes('.v1917-partner'),'파트너 칩 CSS 없음');
  // 리플레이 lib 도 프로덕션과 같이 클리어 실측을 싣는다.
  assert(fs.readFileSync(path.join(__dirname,'lib/ordlog_replay.js'),'utf8').includes("'ord_clear_stats.js'"),'리플레이 lib 클리어 실측 로드 없음');
});

console.log(`\n${checks} checks passed (v19.17.0 전제 승격·실측 파트너)`);
