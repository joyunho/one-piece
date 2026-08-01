'use strict';
// v19.9.3 계약 — 로컬 서버 직접 읽기 시험(사용자 확인 요청).
//
// tmo.gg 페이지가 폴링하는 TMO 데스크톱 프로그램의 Horse 서버
// (127.0.0.1:25625/datas)를 코치가 직접 읽을 수 있는지 판정하는 진단 버튼.
// 되면 "TMO 탭을 띄워 놔야 하는" 구조 자체를 없애는 A안으로 간다.
// 진단 전용 계약: 응답을 저장하지 않고, 주소는 로컬 Horse 서버로만 제한.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const app=read('ord_app.js'),background=read('background.js'),css=read('ord_cockpit_v15.css');
const manifest=JSON.parse(read('manifest.json'));
let checks=0;const check=async(name,fn)=>{await fn();checks++;console.log('PASS ',name);};

(async()=>{
await check('① 배선 — 권한·백그라운드 핸들러·주소 제한·타임아웃',()=>{
  assert(manifest.host_permissions.includes('http://127.0.0.1:25625/*'),'로컬 서버 host 권한 없음');
  assert(background.includes("message.type === 'ORD_LOCAL_PROBE'"),'백그라운드 핸들러 없음');
  assert(background.includes("/^http:\\/\\/127\\.0\\.0\\.1:25625\\//"),'주소 허용 목록 제한 없음');
  const probe=background.slice(background.indexOf("ORD_LOCAL_PROBE"));
  assert(probe.includes('AbortController')&&probe.includes('4000'),'타임아웃 없음');
  assert(probe.includes('허용되지 않은 주소'),'주소 거부 응답 없음');
  // 진단 전용 — 스냅샷 저장 경로(chrome.storage)와 절대 섞이지 않는다.
  const handlerEnd=probe.indexOf('return true;');
  assert(!probe.slice(0,handlerEnd).includes('storage'),'진단 응답이 저장 경로를 만진다');
});

await check('② 앱 — 진단 버튼·판정 신호·덤프(런타임)',async()=>{
  assert(app.includes('v199LocalProbe'),'진단 메서드 없음');
  assert(app.includes("a==='local-probe'"),'버튼 액션 배선 없음');
  assert(app.includes('renderV199LocalProbe'),'진단 섹션 렌더러 없음');
  assert(app.includes('직접 읽기 유력'),'판정 신호 라벨 없음');
  assert(css.includes('.v199-local-probe'),'진단 섹션 스타일 없음');
  // 런타임: fetch 를 가짜 로컬 서버로 바꿔 성공·실패 두 경로를 재현한다.
  const context={console,setTimeout,clearTimeout};context.window=context;vm.createContext(context);
  context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
    vm.runInContext(read(file),context,{filename:file});
  }
  const App=context.ORDApp.App;
  const obj=Object.create(App.prototype);
  obj.config={source:'standalone-manual'};
  obj.catalog=context.ORD_TMO_UNITS;
  obj.render=()=>{};
  // 성공 경로: 카탈로그 코드가 든 가짜 응답 — 일치 스캔이 잡아야 한다.
  const fake=JSON.stringify({units:[{code:'300h',count:3},{code:'810e',count:12},{code:'Z90h',count:1}]});
  context.AbortController=class{constructor(){this.signal={};}abort(){}};
  context.fetch=async()=>({status:200,headers:{get:()=>'application/json'},text:async()=>fake});
  await obj.v199LocalProbe();
  assert.strictEqual(obj._localProbe.state,'done','성공 경로가 done 이 아니다');
  assert(obj._localProbe.json===true,'JSON 해석 실패');
  assert(obj._localProbe.idHits>=3,`카탈로그 코드 일치 스캔이 못 잡음 (${obj._localProbe.idHits})`);
  assert(obj._localProbe.full.includes('300h'),'전체 덤프 없음');
  const html=obj.renderV199LocalProbe();
  assert(html.includes('v199-local-probe')&&html.includes('textarea'),'결과 덤프 UI 없음');
  // 실패 경로: 연결 거부 — 실패 문구가 그대로 판정 자료로 남는다.
  context.fetch=async()=>{throw new Error('Failed to fetch');};
  await obj.v199LocalProbe();
  assert.strictEqual(obj._localProbe.state,'error','실패 경로가 error 가 아니다');
  assert(obj.renderV199LocalProbe().includes('읽기 실패'),'실패 표시 없음');
});

console.log(`\n${checks}/${checks} v19.9.3 local probe checks passed.`);
})().catch(error=>{console.error('FAIL',error&&error.message||error);process.exit(1);});
