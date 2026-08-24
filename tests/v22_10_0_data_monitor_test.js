'use strict';
// v22.10.0 계약 — 0810c 사용자 제보 배치 (2.312 실전 · 63라 라인 사망 포렌식).
//
// 사용자: "베이비 5 이제 광보잡 유닛이 아니라 암브 유닛으로 봐야할듯" +
// "f8 f9 누르면 나오는 화면을 어떤 모니터에 띄울지 알려줬으면 해" +
// "중간에 분명 마딜로 설정되어있는데 스모커 나오고 굳이 레이쥬가 나오고"
//
// ① (변화)베이비5 재분류 — 광보잡 인분 제외 · 암브 가중치 유지 · 이름 교정
// ② F10 — HUD·미니 패널 다음 모니터 이동 (자리 기억 공유)
// ③ 계통 게이트 — 반대 계통 전설의 유틸 예외 은퇴 (마딜 판 마르코·레이쥬·
//    스모커·흰수염이 전부 이 구멍)
// ④ veto 관철 — 파티 프리픽스 재견적·표시 잠금이 넘어간 유닛을 되살리지
//    않는다 (r54 베이비5 veto 2회 무시 → r56~63 여덟 라운드 재승인 봉합)

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const REPO=path.join(__dirname,'..');
const ROOT=path.join(REPO,'ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const tests=[];
function test(name,fn){tests.push([name,fn]);}

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_core.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore;

test('① 베이비5(N70h) — 광보잡 아님 · 암브 유닛 (2.312 사용자 실측)',()=>{
  const unit=context.ORD_TMO_UNITS.find(item=>item.id==='N70h');
  assert(unit,'N70h 이 카탈로그에 없다');
  assert(/암브/.test(String(unit.name)),`이름이 교정되지 않았다: ${unit.name}`);
  assert(!/광보잡/.test(String(unit.name)),'이름에 옛 (광보잡) 표기가 남아 있다');
  const role=C.roleProfile(unit);
  assert.strictEqual(!!role.boss,false,'보스 잡기 플래그가 여전히 산다');
  assert.strictEqual(!!role.frenzy,false,'광폭화 플래그가 여전히 산다');
  assert(role.armorBreak,'암브 가중치가 사라졌다 (patch2310 아머브레이크:1)');
  const contribution=C.roleContribution(unit,'physical');
  assert.strictEqual(C.num(contribution.bossFrenzy),0,'광보잡 인분으로 여전히 센다');
  assert(C.num(contribution.armorBreak)>0,'암브 기여가 0이다');
  // ID 교정은 라이브 페이로드의 옛 플래그도 이겨야 한다 — V30h 코알라 관례.
  const src=read('ord_core.js');
  assert(src.includes("u.id==='N70h'"),'roleProfile ID 교정이 없다');
});

test('② F10 — HUD·미니 패널 다음 모니터 이동',()=>{
  const main=fs.readFileSync(path.join(REPO,'desktop/main.js'),'utf8');
  assert(main.includes("register('F10', moveOverlayToNextDisplay)"),'F10 등록 없음');
  assert(main.includes('screen.getAllDisplays()'),'모니터 열거 없음');
  // 자리 기억 공유 — 옮긴 자리는 bounds 파일에 저장돼 F8/F9/재실행이 같은
  // 자리를 쓴다.  창이 없어도 다음에 열릴 자리를 바꾼다.
  const move=main.slice(main.indexOf('function moveOverlayToNextDisplay'),main.indexOf('// v19.15.0'));
  assert(move.includes('OVERLAY_BOUNDS_FILE()'),'이동 자리가 bounds 파일에 저장되지 않는다');
  assert(move.includes('hudWin.setBounds(target)'),'HUD 창이 함께 이동하지 않는다');
  assert(move.includes('win.setBounds(target)'),'미니 패널이 함께 이동하지 않는다');
  // v24.3.1 재핀(사용자: "f8 9 기능 f56으로 바꿔"): F5/F6 등록 (v19_11 핀과 동일 자구).
  assert(main.includes("register('F5', toggleHud)")&&main.includes("register('F6', toggleOverlay)"),'F5/F6 등록이 깨졌다');
  const readme=fs.readFileSync(path.join(REPO,'desktop/README.md'),'utf8');
  assert(readme.includes('F10'),'README 에 F10 안내가 없다');
});

test('③ 계통 게이트 — 마딜 경로에서 물딜 전설은 유틸이 있어도 우주 밖',()=>{
  const engineContext={console};engineContext.window=engineContext;vm.createContext(engineContext);
  engineContext.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js']){
    vm.runInContext(read(file),engineContext,{filename:file});
  }
  const EC=engineContext.ORDCore,engine=engineContext.ORDV15Engine;
  const edb=EC.buildDb(engineContext.ORD_TMO_UNITS);
  const magicRoute={mode:'magic',key:'singleEnd'};
  // 0810c 실측 4인방 — 전부 [물딜] 전설인데 이감·암브 유틸로 마딜 우주에 들어왔었다.
  for(const id of ['T20h','330h','V20h','B30h']){
    const unit=edb.byId.get(id);
    assert(unit,`${id} 카탈로그에 없음`);
    const ok=(()=>{try{return engine._test.actionUniverse({knowledge:{db:edb},round:{value:45},settings:{},effective:{counts:{},percent:{}}},magicRoute,{requirements:[]},{}).some(u=>u.id===id);}catch(_){return null;}})();
    if(ok!==null)assert.strictEqual(ok,false,`${EC.displayNameOf(unit)}(물딜)이 마딜 우주에 남아 있다`);
  }
  const src=read('ord_v15_engine.js');
  // 배제 근거는 그룹의 명시 계통 표기뿐 — 유틸 예외(utility>0)는 은퇴,
  // 표기 없는 그룹(해적선·왜곡·변화·세라핌)은 공용으로 남는다.
  assert(!src.includes('C.roleContribution(unit,route.mode).utility>0;}'),'유틸 예외가 남아 있다');
  assert(src.includes("if(group.includes('[물딜]'))return route.mode==='physical'"),'명시 계통 배제가 없다');
  // 공용 자원 회귀 방지 — 모비딕호(해적선)·퀸(왜곡)은 마딜 우주에 남는다.
  for(const id of ['Q30h','IC0h']){
    const unit=edb.byId.get(id);
    assert(unit,`${id} 카탈로그에 없음`);
    const kept=(()=>{try{return engine._test.actionUniverse({knowledge:{db:edb},round:{value:45},settings:{},effective:{counts:{},percent:{}}},magicRoute,{requirements:[]},{}).some(u=>u.id===id);}catch(_){return null;}})();
    if(kept!==null)assert.strictEqual(kept,true,`${EC.displayNameOf(unit)}(공용)이 마딜 우주에서 빠졌다`);
  }
});

test('④ veto 관철 — 프리픽스 재견적·표시 잠금이 넘어간 유닛을 되살리지 않는다',()=>{
  const engineContext={console};engineContext.window=engineContext;vm.createContext(engineContext);
  engineContext.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js']){
    vm.runInContext(read(file),engineContext,{filename:file});
  }
  const engine=engineContext.ORDV15Engine;
  // (a) 프리픽스 첫수가 veto 대상이면 승격하지 않고 원 판정 유지.
  const raw={state:'HOLD',reason:'원 판정',action:null,blockedAction:{id:'S50h',name:'도플라밍고'},evidence:{},model:{settings:{_vetoIds:['N70h']},knowledge:{db:{byId:new Map([['N70h',{id:'N70h',name:'베이비 5'}]])}},effective:{counts:{}},round:{value:56},intent:{}}};
  const out=engine.reconcileSquadExecution(raw,{safePrefix:{actions:[{id:'N70h',name:'베이비 5'}]},finalLineup:[{id:'N70h'}]},[]);
  assert.strictEqual(out.state,'HOLD','veto 유닛이 프리픽스로 승격됐다');
  assert.strictEqual(out.evidence&&out.evidence.squadPrefixVetoed,'N70h','veto 존중 증거가 없다');
  // (b) 표시 잠금도 veto 유닛은 붙잡지 않는다.
  const fresh={state:'ACT_NOW',action:{id:'O30h',name:'봉쿠레'},evidence:{}};
  const kept=engine._test.applyCraftLock(fresh,{settings:{_craftLockId:'N70h',_vetoIds:['N70h']}},[]);
  assert.strictEqual(kept,fresh,'veto 잠금이 신선한 판정을 덮었다');
});

test('⑤ 설치·업데이트 — git·winget 전무 PC 에서도 끝까지 간다 (v22.10.1~2 실사례)',()=>{
  // 실사례 연쇄: ZIP 다운로드 + git 미설치 → 설치 즉사(v22.10.1 봉합),
  // 이어서 winget 도 없어 git 설치 안내조차 못 따라감(v22.10.2) —
  // 업데이트는 ZIP 자동 다운로드로, Node 는 공식 MSI 직접 설치로 폴백.
  const ps1=fs.readFileSync(path.join(REPO,'tools/desktop_install.ps1'),'utf8');
  assert(ps1.includes('Get-Command git -ErrorAction SilentlyContinue'),'ps1 git 존재 가드 없음');
  assert(!/\n\$head = & git/.test(ps1),'가드 없는 git 직접 호출이 남아 있다');
  assert(ps1.includes('Get-Command winget -ErrorAction SilentlyContinue'),'ps1 winget 존재 가드 없음');
  assert(ps1.includes("Invoke-RestMethod 'https://nodejs.org/dist/index.json'"),'Node MSI 직접 설치 폴백 없음');
  assert(ps1.includes('/qn /norestart'),'Node MSI 무인 설치 인자 없음');
  const update=fs.readFileSync(path.join(REPO,'업데이트.bat'),'latin1');
  assert(update.includes('where git'),'업데이트 bat 의 git 존재 검사 없음');
  assert(update.includes('zip_update.ps1'),'ZIP 폴백 배선 없음');
  assert(update.includes('%TEMP%\\ord_zip_update.ps1'),'ZIP 헬퍼가 TEMP 로 복사되지 않는다(자기 덮어쓰기 위험)');
  assert(/^[\x00-\x7F]*$/.test(update),'업데이트.bat 에 비ASCII — 코드페이지 깨짐 위험');
  const zip=fs.readFileSync(path.join(REPO,'tools/zip_update.ps1'),'latin1');
  assert(/^[\x00-\x7F]*$/.test(zip),'zip_update.ps1 에 비ASCII — BOM 없이 코드페이지 깨짐 위험');
  assert(zip.includes('archive/refs/heads/main.zip'),'메인 브랜치 ZIP 주소 없음');
  assert(zip.includes("desktop_install.ps1'"),'ZIP 갱신 후 설치 연결 없음');
  assert(zip.includes('SecurityProtocol'),'구형 PS5.1 TLS1.2 보정 없음');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V22_10_0_DATA_MONITOR ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
