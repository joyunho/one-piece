'use strict';

// v19.7: 사용자 요청 7건 배선 고정.
//
//   ① 다른 도우미 번호 실호환 — 위습 이름 인식·유닛 이름 매핑·활성 탭
//      우선·SPA 재고정·기각 사유 기록.
//   ④ 지금 할 일에 부족 흔함 전량 표시.
//   ⑤ 확정 2상위 상시 콜아웃(0731 로그: 306판단 중 0회 노출 재발 방지).
//   ⑥ 막판 랜덤 흔함 노리기(도플 변이 r53~58 HOLD 침묵 재발 방지).
//   ⑦ MAIN world 타이머 언스로틀 — 숨김 탭에서 페이지 로컬 폴링 유지.

const assert=require('assert');
const path=require('path');
const fs=require('fs');
const vm=require('vm');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const read=name=>fs.readFileSync(path.join(EXT,name),'utf8');
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}

const content=read('content-tmo.js');
const background=read('background.js');
const boot=read('ord_boot_extension.js');
const popup=read('popup.js');
const app=read('ord_app.js');
const unthrottle=read('ord_page_unthrottle.js');
const manifest=JSON.parse(read('manifest.json'));

// ── 런타임 준비: 코어 + 카탈로그 ──────────────────────────────────────
const context={console};context.window=context;vm.createContext(context);
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,catalog=context.ORD_TMO_UNITS;

check('① 위습을 id 가 아니라 이름으로도 찾고 810e 별칭 행을 싣는다',()=>{
  assert(content.includes('function findWispRow('),'findWispRow 없음');
  assert(/WISP_NAME_RE\s*=\s*\/\^\(\?:선택\\s\*\)\?위\(\?:습\|스프\)\$\//.test(content),'위습 이름 정규식 없음');
  assert(content.includes("wispSource.id !== '810e'")&&content.includes("units.rows.push(Object.assign({}, wispSource, {id: '810e'"),'810e 별칭 행 주입 없음');
  assert(content.includes('wispAliasId'),'별칭 id 진단 필드 없음');
});

check('① 다른 도우미 문서(전부 낯선 id)가 이름 매핑으로 실제 병합된다',()=>{
  const foreign=catalog.map((u,i)=>({id:`unit_1799${String(100000+i)}_${i}`,name:u.name,groupName:u.groupName,count:i%7===0?2:0,countFound:true,tmoPercent:0}));
  const snapshot={counts:Object.fromEntries(foreign.map(r=>[r.id,r.count])),units:foreign,dataHash:'v197-foreign'};
  assert(C.liveIdMatchRate(catalog,snapshot)<0.01,'외부 문서 일치율이 0이어야 함');
  const state=C.normalizeState(catalog,snapshot,{});
  const withCount=catalog.filter(u=>C.num(state.counts[u.id])>0).length;
  const expected=foreign.filter((r,i)=>i%7===0).length;
  assert(withCount>=expected*0.9,`이름 매핑 수량 유실: ${withCount}/${expected}`);
  assert(state.units.filter(u=>u.remappedFrom).length>=catalog.length*0.9,'리매핑 유닛 수가 너무 적음');
  // 회귀: 원 도우미(32172) 스냅샷은 아무것도 안 바뀐다.
  const native={counts:{'100h':3},units:[{id:'100h',name:'루피',count:3,countFound:true}],dataHash:'v197-native'};
  const nState=C.normalizeState(catalog,native,{});
  assert.strictEqual(nState.units.filter(u=>u.remappedFrom).length,0,'원 도우미에서 리매핑 발생');
  assert.strictEqual(C.num(nState.counts['100h']),3);
});

check('① 활성 탭 우선 선택 · SPA 재고정 · 기각 사유 기록',()=>{
  // boot: 고정 탭 다음은 활성 탭 — 비활성 32172 가 활성 다른 번호를 이기지 않는다.
  const bootSelect=boot.slice(boot.indexOf('let selected = list.find(tab => tab.id === Number(source.tabId))'),boot.indexOf('return selected || list[0]'));
  const activeAt=bootSelect.indexOf('tab.active');
  const primaryAt=bootSelect.indexOf('PRIMARY_HELPER_ID');
  assert(activeAt>=0&&primaryAt>=0&&activeAt<primaryAt,'boot 이 여전히 32172 를 활성 탭보다 우선함');
  // popup 도 동일.
  const popupSelect=popup.slice(popup.indexOf('function selectPreferred'),popup.indexOf('function matchingHeartbeat'));
  assert(popupSelect.indexOf('tab.active')<popupSelect.indexOf('PRIMARY_HELPER_ID'),'popup 이 여전히 32172 우선');
  // background: SPA 번호 변경 재고정 + 기각 기록.
  assert(background.includes('chrome.tabs.onUpdated.addListener'),'SPA 재고정 리스너 없음');
  assert(background.includes("recordReject('helper-repinned'"),'재고정 기록 없음');
  for(const reason of ['unsupported-helper','unselected-tab','unselected-helper','invalid-snapshot','no-pinned-source']){
    assert(background.includes(`'${reason}'`),`기각 사유 누락: ${reason}`);
  }
  assert(background.includes('ordLatestReject'),'기각 저장 키 없음');
  assert(popup.includes('ordLatestReject'),'popup 이 기각 사유를 안 읽음');
});

check('④ 지금 할 일이 부족 흔함을 전량(색점 칩) 표시한다',()=>{
  assert(app.includes('부족 흔함'),'흔함 부족 라벨 없음');
  assert(app.includes('common-chip'),'흔함 색점 칩 없음');
  assert(app.includes('solve=C.recipeSolve(state.db,shown.id,state.counts||{})'),'quote 없는 상태의 흔함 재계산 폴백 없음');
  const css=read('ord_cockpit_v15.css');
  assert(css.includes('.v151-mats .commons em.common-chip'),'흔함 칩 스타일 없음');
  assert(css.includes('.v153-next .v151-mats>div:not(.commons){display:none}'),'노트북 압축에서 흔함 줄까지 숨김');
});

check('⑤ 확정 2상위가 미보유면 지금 할 일에 상시 콜아웃이 뜬다(런타임)',()=>{
  const appContext={console};appContext.window=appContext;vm.createContext(appContext);
  appContext.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
    vm.runInContext(read(file),appContext,{filename:file});
  }
  const App=appContext.ORDApp.App,CC=appContext.ORDCore;
  const state=CC.normalizeState(appContext.ORD_TMO_UNITS,{counts:{},units:[]},{});
  const appObj=Object.create(App.prototype);
  appObj.state={secondUpperId:'V80H'};
  const html=appObj.v157SecondUpperCallout(state,{action:{id:'Q40h'}});
  assert(html.includes('v157-second-callout'),'콜아웃 미표시');
  assert(html.includes('확정 2상위'),'라벨 없음');
  assert(/data-act="detail" data-id="V80H"/.test(html),'상세 버튼 없음');
  // 보유하면 사라진다.
  const owned=Object.assign({},state,{counts:Object.assign({},state.counts,{V80H:1})});
  assert.strictEqual(appObj.v157SecondUpperCallout(owned,{action:{id:'Q40h'}}),'','보유 후에도 콜아웃 잔존');
  // 미확정이면 없다.
  appObj.state={secondUpperId:''};
  assert.strictEqual(appObj.v157SecondUpperCallout(state,{}),'');

  // ⑥ 막판 랜덤 흔함 노리기: 0731 로그 재현 — 도플 변이(S50h)가 희귀
  // 도플라밍고(L10h) 보유 + 흔함 3장 부족 상태.
  appObj.state={secondUpperId:''};
  appObj.actualRound=()=>54;
  // 0731 로그 r54 국면 재현: 희귀 도플라밍고(L10h) 트리가 흔함 3장까지
  // 좁혀진 손 — 조상 희귀는 미보유(흔함부터 쌓아 올리는 각이 핵심).
  const doppelState=CC.normalizeState(appContext.ORD_TMO_UNITS,{counts:{'800h':2,'400h':2,'600h':3,'500h':3},units:[]},{wispOverride:14});
  const solve=CC.recipeSolve(doppelState.db,'S50h',doppelState.counts);
  const commonsShort=Object.values(solve.lowestMissing||{}).reduce((s,v)=>s+CC.num(v),0);
  assert(commonsShort>0&&commonsShort<=6,`픽스처 전제 위반: 도플 변이 흔함 부족 ${commonsShort}`);
  const hint=appObj.v157LongshotHint(doppelState,'HOLD');
  assert(hint.includes('v157-longshot'),'막판 힌트 미표시');
  assert(hint.includes('도플라밍고'),'도플 변이가 후보로 안 잡힘');
  assert(hint.includes('랜덤 흔함'),'랜덤 흔함 근거 문구 없음');
  // 46라 전이나 ACT_NOW 에서는 안 뜬다.
  appObj.actualRound=()=>40;
  assert.strictEqual(appObj.v157LongshotHint(doppelState,'HOLD'),'');
  appObj.actualRound=()=>54;
  assert.strictEqual(appObj.v157LongshotHint(doppelState,'ACT_NOW'),'');
  console.log(`PASS  ⑥ 도플 변이 흔함 ${commonsShort}장 픽스처에서 막판 힌트가 뜬다(런타임)`);checks++;
});

check('⑦ MAIN world 언스로틀 — 워커 타이머 치환·안전 폴백·콘텐츠 신호',()=>{
  // manifest: MAIN world + document_start (경계는 package_validation 이 잰다).
  const entry=manifest.content_scripts.find(script=>(script.js||[]).includes('ord_page_unthrottle.js'));
  assert(entry&&entry.world==='MAIN'&&entry.run_at==='document_start','manifest 배선 없음');
  // 파일 계약: 워커 실패 시 무개입, id 대역 분리, 100~2500ms 함수 콜백만.
  assert(unthrottle.includes('if (!worker) return;'),'워커 실패 폴백 없음');
  assert(unthrottle.includes('1 << 30'),'네이티브와 겹치지 않는 id 대역 없음');
  assert(unthrottle.includes('ms < 100 || ms > 2500'),'치환 범위 제한 없음');
  assert(unthrottle.includes("__ord: 'tmo-poll-tick'"),'틱 신호 없음');
  const unthrottleCode=unthrottle.replace(/\/\/[^\n]*/g,'');
  assert(!/fetch\(|XMLHttpRequest|127\.0\.0\.1/.test(unthrottleCode),'언스로틀러가 네트워크를 만짐 — 타이머 치환만 해야 한다');
  // content: 숨김 상태에서 틱 신호를 받아 스캔한다(간격 상한 포함).
  // v19.9.2: 틱 스캔은 조여지는 schedule(setTimeout)이 아니라 즉시 publish 다
  // — 상세 계약은 v19_9_1_connection_test 가 잰다.
  assert(content.includes("event.data.__ord !== 'tmo-poll-tick'"),'content 틱 수신 없음');
  assert(content.includes("publish(false, 'worker-tick')"),'틱 스캔 없음');
  assert(content.includes('lastWorkerTickScanAt < 2500')||content.includes('- lastWorkerTickScanAt < 2500'),'틱 간격 상한 없음');
  // popup: 미니 창 폴백.
  assert(popup.includes("type: 'popup'")&&popup.includes('miniwin'),'미니 창 분리 버튼 없음');
});

check('① 로그가 도우미 번호를 보존한다(다음 포렌식용)',()=>{
  const compactor=read('ord_run_log_compactor.js');
  assert(compactor.includes('out.helperId=String(snapshot.helperId)'),'compactor 가 helperId 를 버림');
  assert(compactor.includes('out.adapterId=String(snapshot.adapterId)'),'compactor 가 adapterId 를 버림');
});

console.log(`\n${checks}/${checks} v19.7 batch checks passed.`);
