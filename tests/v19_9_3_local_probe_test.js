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
const app=read('ord_app.js'),background=read('background.js'),css=read('ord_ui_v20.css');
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

await check('③ 페이지 실측 네트워크 탭 — 관찰 전용·로컬 한정·링버퍼(v19.9.4)',()=>{
  const nettap=read('ord_page_nettap.js');
  const unthrottle=read('ord_page_unthrottle.js');
  const content=read('content-tmo.js');
  // 관찰 전용 계약: 원 함수를 항상 그대로 통과시키고, 응답은 사본에서만 읽는다.
  assert(nettap.includes('nativeFetch.apply(this, arguments)'),'fetch 원 함수 통과 없음');
  assert(nettap.includes('nativeSend.apply(this, arguments)'),'XHR 원 함수 통과 없음');
  assert(nettap.includes('response.clone()'),'응답 사본이 아니라 원 응답을 소비');
  assert(nettap.includes('__ORD_TMO_NETTAP__'),'이중 주입 가드 없음');
  // 로컬 Horse 서버만 본다 — 다른 트래픽 관찰 금지.
  assert(nettap.includes('127\\.0\\.0\\.1:25625'),'로컬 주소 한정 없음');
  // 탭 자체는 네트워크를 발신하지 않는다(관찰만).
  const nettapCode=nettap.replace(/\/\/[^\n]*/g,'');
  assert(!/nativeFetch\(|new XMLHttpRequest/.test(nettapCode),'탭이 자체 요청을 발신');
  // 언스로틀러의 "네트워크 무개입" 계약은 그대로다 — 탭은 별도 파일.
  const unthrottleCode=unthrottle.replace(/\/\/[^\n]*/g,'');
  assert(!/fetch\(|XMLHttpRequest|127\.0\.0\.1/.test(unthrottleCode),'언스로틀러가 네트워크를 만짐');
  // manifest: MAIN world + document_start, build-helper 한정.
  const entry=manifest.content_scripts.find(script=>(script.js||[]).includes('ord_page_nettap.js'));
  assert(entry&&entry.world==='MAIN'&&entry.run_at==='document_start','manifest 배선 없음');
  assert(entry.matches.every(pattern=>pattern.includes('/build-helper/')),'build-helper 밖으로 넓어짐');
  // content: 10초 중복 억제 후 전달, background: 링버퍼 8건.
  assert(content.includes("event.data.__ord !== 'tmo-local-request'"),'content 수신 없음');
  assert(content.includes('localTapMemo')&&content.includes('10000'),'중복 억제 없음');
  assert(background.includes("message.type === 'ORD_LOCAL_TAP'"),'background 저장 없음');
  assert(background.includes('ordLocalTapLog')&&background.includes('slice(0, 8)'),'링버퍼 상한 없음');
  // 진단 화면이 실측 기록을 함께 보여준다.
  assert(app.includes('페이지 실측 요청'),'진단 화면 실측 표시 없음');
  assert(app.includes('ordLocalTapLog'),'진단 화면이 기록을 안 읽음');
});

await check('④ 매핑 표본 수집기 + 유도 도구(v19.9.5 · 런타임)',()=>{
  // 0801 실측: 게임 중 /datas 는 인게임 로우코드로 말한다(흔함 5종만 카탈로그
  // id 일치).  같은 순간의 DOM 패와 쌍으로 저장해 수량 궤적 대조로 푼다.
  const bg=read('background.js');
  assert(bg.includes('collectLocalMapSample'),'표본 수집기 없음');
  assert(bg.includes('ordLocalMapSamples')&&bg.includes('slice(-48)'),'표본 링버퍼 상한 없음');
  assert(bg.includes('12000'),'DOM 신선도 게이트 없음');
  assert(bg.includes('lastMapSampleHash'),'변화 없는 표본 중복 저장 방지 없음');
  assert(app.includes('매핑 표본'),'진단 화면 표본 표시 없음');
  assert(app.includes('unmatchedCodes'),'미해석 코드 목록 없음');
  assert(app.includes("['GOLD', 'LUMBER', 'FOOD']")||app.includes("['GOLD','LUMBER','FOOD']"),'재화 키 제외 없음');
  // 유도 도구: 합성 표본으로 궤적 대조가 실제로 풀리는지 돌려 본다.
  const {execFileSync}=require('child_process'),os=require('os');
  const tmp=path.join(os.tmpdir(),`ord-map-samples-${process.pid}.json`);
  fs.writeFileSync(tmp,JSON.stringify([
    {at:1,live:{XI0e:5,'600h':1,S60h:2,GOLD:50},dom:{'810e':5,'600h':1,'100h':2}},
    {at:2,live:{XI0e:7,'600h':1,S60h:3},dom:{'810e':7,'600h':1,'100h':3}},
    {at:3,live:{XI0e:4,'600h':2,S60h:3},dom:{'810e':4,'600h':2,'100h':3}}
  ]));
  try{
    const out=execFileSync(process.execPath,[path.join(__dirname,'..','tools','derive_local_map.js'),tmp],{encoding:'utf8'});
    assert(out.includes('XI0e → 810e'),'위습 궤적 대조 실패');
    assert(out.includes('S60h → 100h'),'유닛 궤적 대조 실패');
    assert(out.includes('"600h": "600h"'),'직결 코드가 매핑 표에 없음');
  }finally{try{fs.unlinkSync(tmp);}catch(_){}}
});

console.log(`\n${checks}/${checks} v19.9.3 local probe checks passed.`);
})().catch(error=>{console.error('FAIL',error&&error.message||error);process.exit(1);});
