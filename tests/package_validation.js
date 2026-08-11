'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const requested=process.argv[2];
const ext=path.resolve(requested||path.join(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild'));
assert(fs.existsSync(path.join(ext,'manifest.json')),'v15 extension directory not found');
const packageInfo=JSON.parse(fs.readFileSync(path.resolve(ext,'../package.json'),'utf8'));
const releaseVersion=String(packageInfo.version);
const releaseFileVersion=releaseVersion.replace(/\./g,'_');

const required=[
  'manifest.json','background.js','content-tmo.js','ord_page_unthrottle.js','ord_helper.html','ord_units_data.js',
  'ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_core.js',
  'ord_squad_planner.js','ord_direction_worker.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_run_log_compactor.js','ord_run_log.js','ord_app.js','ord_app.css','ord_ui_v20.css','ord_boot_extension.js',
  'popup.html','popup.js','popup.css','README.txt'
];
for(const file of required)assert(fs.existsSync(path.join(ext,file)),`missing ${file}`);
for(const removed of ['ord_ai_advisor.js'])assert(!fs.existsSync(path.join(ext,removed)),`removed OpenAI file remains: ${removed}`);

const read=file=>fs.readFileSync(path.join(ext,file),'utf8');
const manifest=JSON.parse(read('manifest.json'));
assert.strictEqual(manifest.manifest_version,3);
assert.strictEqual(manifest.version,releaseVersion);
assert.deepStrictEqual(manifest.background,{service_worker:'background.js'});
assert.deepStrictEqual(new Set(manifest.permissions),new Set(['storage','tabs','scripting','alarms']));
assert(manifest.host_permissions.length>0,'build-helper permissions are missing');
// v19.4(사용자 요청): 도우미 번호 고정 해제 — 대신 tmo.gg + /build-helper/
// 밖으로는 절대 넓히지 않는다는 경계를 그대로 잰다.
// v19.9.3(사용자 확인 요청): 로컬 Horse 서버 진단(127.0.0.1:25625) 딱 한
// 주소만 예외 — 웹 호스트는 여전히 tmo.gg /build-helper/ 뿐이고, 그 밖의
// localhost 광역 권한(포트 전체·다른 포트)은 계속 금지한다.
const LOCAL_PROBE_PERMISSION='http://127.0.0.1:25625/*';
for(const pattern of manifest.host_permissions){
  if(pattern===LOCAL_PROBE_PERMISSION)continue;
  assert(pattern.includes('/build-helper/'),'host permission is broader than build-helper');
  assert(/^https:\/\/(www\.)?tmo\.gg\//.test(pattern),`tmo.gg 밖 호스트 권한: ${pattern}`);
  assert(/\/build-helper\/\*$/.test(pattern),`build-helper 하위로 안 끝나는 권한: ${pattern}`);
}
assert(!manifest.host_permissions.some(pattern=>pattern!==LOCAL_PROBE_PERMISSION&&/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(pattern)),'local bridge permission remains');
assert.strictEqual(manifest.host_permissions.filter(pattern=>pattern===LOCAL_PROBE_PERMISSION).length,1,'로컬 진단 권한은 정확히 한 번');
for(const script of manifest.content_scripts){
  for(const pattern of script.matches){
    assert(pattern.includes('/build-helper/'),'content script match is broader than build-helper');
    assert(/\/build-helper\/\*$/.test(pattern),`build-helper 하위로 안 끝나는 매치: ${pattern}`);
  }
}
// v19.7(⑦): MAIN world 언스로틀러 — 숨김 탭에서 페이지의 로컬 폴링 타이머를
// 워커로 살리는 두 번째 콘텐츠 스크립트.  경계는 위 루프가 같이 잰다.
{
  const unthrottle=manifest.content_scripts.find(script=>(script.js||[]).includes('ord_page_unthrottle.js'));
  assert(unthrottle,'page unthrottle content script missing');
  assert.strictEqual(unthrottle.world,'MAIN','unthrottle must run in the page world');
  assert.strictEqual(unthrottle.run_at,'document_start','unthrottle must wrap timers before page scripts run');
}

for(const file of ['background.js','content-tmo.js','ord_page_unthrottle.js','ord_page_nettap.js','ord_local_code_map.js','ord_upper_playbook.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_core.js','ord_squad_planner.js','ord_direction_worker.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_run_log_compactor.js','ord_run_log.js','ord_app.js','ord_boot_extension.js','popup.js']){
  new vm.Script(read(file),{filename:file});
}
const helper=read('ord_helper.html'),popup=read('popup.html');
assert(!/\son\w+\s*=/.test(helper+popup),'inline event handler violates MV3 CSP');
// v17.22: 버전을 정규식에 직접 박아두면 릴리스마다 조용히 낡는다
// (실제로 여기서 두 번 낡았다) — manifest 버전을 단일 원천으로 쓴다.
assert(helper.includes(`<meta name="ord-helper" content="v${manifest.version}-decision-engine">`),`v${manifest.version} helper marker missing`);
assert(helper.indexOf('ord_data_patch.js')<helper.indexOf('ord_story_nonupper_data.js'),'data patch must load before measured story data');
assert(helper.indexOf('ord_story_nonupper_data.js')<helper.indexOf('ord_story_upper_data.js'),'non-upper story data must load before upper story data');
assert(helper.indexOf('ord_story_upper_data.js')<helper.indexOf('ord_core.js'),'measured story data must load before core');
assert(helper.indexOf('ord_meta_stats.js')<helper.indexOf('ord_core.js'),'meta stats digest must load before core');
assert(helper.indexOf('ord_core.js')<helper.indexOf('ord_squad_planner.js'),'planner must load after core');
assert(helper.indexOf('ord_squad_planner.js')<helper.indexOf('ord_v15_model.js'),'v15 model must load after legacy knowledge modules');
assert(helper.indexOf('ord_v15_engine.js')<helper.indexOf('ord_run_log_compactor.js'),'run-log compactor must load after v15 engine');
assert(helper.indexOf('ord_run_log_compactor.js')<helper.indexOf('ord_run_log.js'),'run-log storage must load after compactor');
assert(helper.indexOf('ord_run_log.js')<helper.indexOf('ord_app.js'),'run-log modules must load before app');
assert(helper.indexOf('ord_upper_playbook.js')>0&&helper.indexOf('ord_upper_playbook.js')<helper.indexOf('ord_app.js'),'upper playbook must load before app');
assert(!/ord_ai_advisor|openai|127\.0\.0\.1:38766/i.test(helper+popup+JSON.stringify(manifest)),'OpenAI UI or bridge surface remains');

const context={console};context.window=context;vm.createContext(context);
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const units=context.ORD_TMO_UNITS,C=context.ORDCore,planner=context.ORDSquadPlanner;
assert.strictEqual(C.VERSION,releaseVersion);
assert.strictEqual(planner.VERSION,releaseVersion);
assert.strictEqual(typeof planner.planFinalSquad,'function');
assert.strictEqual(context.ORDV15Engine.VERSION,releaseVersion);
const metaStats=context.ORD_META_STATS;
assert(metaStats&&metaStats.schema==='ord-meta-stats-v1','meta stats digest missing');
assert.strictEqual(metaStats.usage.gate,false,'meta stats must never gate');
assert.strictEqual(metaStats.usage.allowKillVerdict,false,'meta stats must never allow kill verdicts');
assert(Object.keys(metaStats.byCode||{}).length>=100,'meta stats byCode unexpectedly small');
assert(metaStats.gameCount>=10000,'meta stats game count unexpectedly small');
assert(!/nickname|닉네임/.test(JSON.stringify(metaStats)),'meta stats digest must not carry player identifiers');
assert.strictEqual(typeof C.storyLeagueRows,'function','story league API missing');
assert.strictEqual(context.OrdAiAdvisor,undefined,'OpenAI runtime remains globally exposed');
assert(units.length>=300,'catalog unexpectedly incomplete');
assert.strictEqual(new Set(units.map(unit=>unit.id)).size,units.length,'duplicate unit IDs');
const ids=new Set(units.map(unit=>unit.id));
for(const unit of units)for(const material of unit.stuffs||[])assert(ids.has(material.id)||C.SPECIAL_IDS[material.id],`broken recipe ${unit.id} -> ${material.id}`);
for(const unit of units.filter(C.isUpper))assert.notStrictEqual(context.ORD_SYNERGY_MEMO.byUnitId[unit.id],undefined,`missing upper synergy ${unit.id}`);
// v19.5(사용자 요청): 상위 플레이북 — 카탈로그의 모든 상위가 요약·활용·페어를
// 갖고, 화면에 넘치지 않는 길이를 지킨다.  표시 전용 계약: 엔진·플래너가
// 이 데이터를 판단에 쓰기 시작하면 여기서 잡는다.
const playbook=context.ORD_UPPER_PLAYBOOK;
assert(playbook&&playbook.byId,'upper playbook missing');
for(const unit of units.filter(C.isUpper)){
  const entry=playbook.byId[unit.id];
  assert(entry,`missing playbook entry ${unit.id} (${unit.name})`);
  assert(entry.summary&&entry.summary.length<=60,`playbook summary bad ${unit.id}`);
  assert(entry.use&&entry.use.length<=70,`playbook use bad ${unit.id}`);
  assert(Array.isArray(entry.pairs)&&entry.pairs.length>=2&&entry.pairs.length<=4&&entry.pairs.every(name=>name&&name.length<=12),`playbook pairs bad ${unit.id}`);
}
for(const engineFile of ['ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_direction_worker.js']){
  assert(!read(engineFile).includes('ORD_UPPER_PLAYBOOK'),`${engineFile} 이 표시 전용 플레이북을 참조함 — 엔진 판단에 쓰면 안 된다`);
}
const storyLeagueCounts=C.storyLeagueRows(units).reduce((out,row)=>{out[row.league]=(out[row.league]||0)+1;return out;},{});
// v23.0 재핀: 베가펑크 소환물 3기 상위→기타(소환) 재분류 — 상위 89→86.
assert.deepStrictEqual(JSON.parse(JSON.stringify(storyLeagueCounts)),{rare:42,upper:86,legend:81},'story league catalog counts changed');

const content=read('content-tmo.js'),background=read('background.js'),boot=read('ord_boot_extension.js');
assert(content.indexOf("'32172': Object.freeze")<content.indexOf("'34366': Object.freeze"),'32172 is not the primary adapter');
// v19.4: 지정 어댑터는 content 에만 남고, background/boot 는 숫자 id 전반을
// 받는다 — 번호 하드코딩이 되살아나면 여기서 잡는다.
assert(content.includes("'32172'")&&content.includes("'34366'"),'named adapters missing');
assert(content.includes('tmo-${key}-auto'),'generic numeric adapter missing');
assert(!background.includes("'32172'")&&!background.includes("'34366'"),'background re-hardcodes helper ids');
assert(!/unitCount\s*={2,3}\s*307/.test(background+boot),'connector still hard-codes a 307-row validity gate');
assert(!/idSetHash\s*={2,3}\s*['\"]16e572cb/.test(background+boot),'connector still hard-codes an old fingerprint gate');
for(const key of ['collection.confidence','countDiscovery','scanAt','dataChangedAt','bridgeAt'])assert((background+content+boot).includes(key),`connector contract missing ${key}`);
assert(background.includes('unitCount >= 300')&&background.includes('unitCount <= 380'),'adapter row range guard missing');
assert(background.includes('parsedCoverage === 1')&&background.includes('counts.missing')&&background.includes('counts.ambiguous'),'full-count guard missing');
assert(background.includes('wispCountFound === true'),'selection-wisp guard missing');
assert(content.includes('setInterval(poll, POLL_INTERVAL_MS)')&&content.includes('const POLL_INTERVAL_MS = 2000'),'shallow fallback probe missing');
assert(content.includes('const FULL_AUDIT_INTERVAL_MS = 30000'),'periodic full audit missing');
assert(content.includes("type: 'ORD_HEARTBEAT'")&&background.includes("message.type === 'ORD_HEARTBEAT'"),'compact heartbeat channel missing');
assert(background.includes('ordLatestHeartbeat')&&boot.includes('ordLatestHeartbeat'),'heartbeat bridge missing');
assert(content.includes('playableUnitCount')&&content.includes('SPECIAL_ROW_IDS'),'playable-unit auto-round signal missing');
assert(background.includes('nextAutoRound')&&background.includes('ordAutoRoundState'),'background auto-round generation missing');

const now=Date.now(),healthSnapshot={
  source:'tmo',parser:'ord-tmo-parser-v13-adapter',helperId:'32172',at:now,scanAt:now,bridgeAt:now,dataChangedAt:now,
  unitCount:324,collection:{found:true,confidence:.95},countDiscovery:{found:true,parsed:324,missing:0,ambiguous:0},
  wispCountFound:true,abilityCount:5,connected:true
};
assert.strictEqual(C.snapshotHealth(healthSnapshot,now).ready,true,'valid confidence-based v13 snapshot is blocked');
// v19.7.1(외부 감사): 임의 숫자 번호는 상태 판정도 통과해야 한다 — 내용
// 게이트가 진짜 판별자다.  숫자가 아닌 id 만 거부한다.
assert.strictEqual(C.snapshotHealth(Object.assign({},healthSnapshot,{helperId:'99999'}),now).ready,true,'numeric helper id is rejected by health');
assert.strictEqual(C.snapshotHealth(Object.assign({},healthSnapshot,{helperId:'not-a-number'}),now).ready,false,'non-numeric helper is accepted');

const rows=units.map(unit=>({id:unit.id,name:unit.name,count:0,countFound:true,tmoPercent:0}));
const compactSnapshot={
  source:'tmo',parser:'ord-tmo-parser-v13-adapter',helperId:'32172',sessionId:'size-test',seq:1,
  scanAt:now,dataChangedAt:now,at:now,url:'https://tmo.gg/ko/build-helper/32172',unitCount:rows.length,
  collection:{found:true,confidence:.95,errors:[]},countDiscovery:{found:true,parsed:rows.length,missing:0,ambiguous:0,errors:[]},
  wispCountFound:true,units:rows,counts:Object.fromEntries(rows.map(row=>[row.id,0])),dataHash:'size-test'
};
const payloadBytes=Buffer.byteLength(JSON.stringify(compactSnapshot));
assert(payloadBytes<160000,`snapshot payload too large: ${payloadBytes}`);

// v20.0: 2.310 대응 — 매뉴얼 파일명도 맵 버전을 따라간다.
const manualPath=path.resolve(ext,`../ord_2310_nightmare_helper_v${releaseFileVersion}_manual.html`);
assert(!fs.readdirSync(path.resolve(ext,'..')).some(name=>/^ord_2305_nightmare_helper_v.*_manual\.html$/.test(name)),'stale 2.305 manual remains after the 2.310 rename');
assert(fs.existsSync(manualPath),'standalone v15 manual bundle missing');
assert(!fs.existsSync(path.resolve(ext,'../ord_2305_nightmare_helper_v14_2_0_manual.html')),'stale v14 manual remains in the v15 package');
assert(!fs.existsSync(path.resolve(ext,'../ord_2305_nightmare_helper_v17_18_0_manual.html')),'stale v17.18 manual remains in the v17.20 package');
assert(!fs.existsSync(path.resolve(ext,'../ord_2305_nightmare_helper_v17_19_0_manual.html')),'stale v17.19 manual remains in the v17.20 package');
const manual=fs.readFileSync(manualPath,'utf8');
assert(manual.includes(`<meta name="ord-helper" content="v${manifest.version}-decision-engine-manual">`),'manual build marker missing');
assert(/source:\s*['\"]standalone-manual['\"]/.test(manual),'standalone manual boot missing');
assert(!/openai|ord_ai_advisor|127\.0\.0\.1:38766/i.test(manual),'OpenAI surface remains in manual');
let manualScripts=0;const embeddedScripts=new Map();
for(const match of manual.matchAll(/<script data-source="([^"]+)">([\s\S]*?)<\/script>/g)){
  new vm.Script(match[2],{filename:`manual:${match[1]}`});
  embeddedScripts.set(match[1],match[2].trim());
  manualScripts++;
}
// v18.5: 아이콘 팩(ord_icons.js)이 들어와 20 → 21.  이 수는 "번들에 들어갈
// 스크립트가 조용히 늘거나 줄지 않았는가"를 지키는 계약이라, 바뀔 때마다
// 이유를 남기고 갱신한다.
// v19.5: 상위 플레이북(ord_upper_playbook.js)이 들어와 21 → 22.
// v19.16: 클리어 실측(ord_clear_stats.js)이 들어와 22 → 23.
assert.strictEqual(manualScripts,23,'manual inline script count changed');
// v19.5(점검 결함): 신선도 대조 목록에 ord_icons.js 가 빠져 있어 아이콘 팩이
// 낡아도 무검출이었다 — 번들 스크립트 전부를 대조한다.
for(const file of ['ord_icons.js','ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_run_log_compactor.js','ord_run_log.js','ord_app.js']){
  assert.strictEqual(embeddedScripts.get(file),read(file).trim(),`manual bundle contains a stale ${file}`);
}
const embeddedCss=manual.match(/<style data-source="ord_app\.css">([\s\S]*?)<\/style>/);
assert(embeddedCss,'manual CSS bundle missing');
assert.strictEqual(embeddedCss[1].trim(),read('ord_app.css').trim(),'manual bundle contains stale CSS');
// v20.1: 매뉴얼은 신작 시트(ord_ui_v20.css)를 인라인한다 — cockpit 은퇴.
const embeddedCockpitCss=manual.match(/<style data-source="ord_ui_v20\.css">([\s\S]*?)<\/style>/);
assert(embeddedCockpitCss,'manual ui-v20 CSS bundle missing');
assert.strictEqual(embeddedCockpitCss[1].trim(),read('ord_ui_v20.css').trim(),'manual bundle contains stale ui-v20 CSS');

assert(!fs.existsSync(path.resolve(ext,'..','openai_bridge')),'removed OpenAI bridge directory remains');
assert(!fs.existsSync(path.resolve(ext,'..','START_OPENAI.bat')),'removed OpenAI launcher remains');

// v20.5.1: 화면에 찍히는 버전이 릴리스와 어긋나면 사용자는 업데이트가
// 됐는지를 알 수 없다.  실제로 v20.4.1 은 코드만 바뀌고 버전 상수를 안
// 올려서 앱이 계속 "v20.4.0" 이라고 말했고, 사용자가 v20.5.0 으로 올린
// 뒤에도 제목 표시줄만 보고는 갱신 여부를 판단할 수 없었다.
// (실사례: "20.4 버전인데 저거 명령어 쳤는데?")
// manifest.version 을 단일 원천으로 삼아 살아 있는 버전 상수를 전부 건다.
{
  const root=path.resolve(ext,'..');
  const readAny=file=>fs.readFileSync(path.join(root,file),'utf8');
  const liveVersions=[
    ['package.json',()=>packageInfo.version],
    ['desktop/package.json',()=>JSON.parse(readAny('desktop/package.json')).version],
    ['desktop/preload.js',()=>(readAny('desktop/preload.js').match(/version:\s*'([\d.]+)'/)||[])[1]],
    ['ord_core.js',()=>(read('ord_core.js').match(/const VERSION='([\d.]+)'/)||[])[1]],
    ['ord_squad_planner.js',()=>(read('ord_squad_planner.js').match(/const VERSION='([\d.]+)'/)||[])[1]],
    ['ord_v15_model.js',()=>(read('ord_v15_model.js').match(/const VERSION='([\d.]+)'/)||[])[1]],
    ['ord_v15_ledger.js',()=>(read('ord_v15_ledger.js').match(/const VERSION='([\d.]+)'/)||[])[1]],
    ['ord_v15_policy.js',()=>(read('ord_v15_policy.js').match(/const VERSION='([\d.]+)'/)||[])[1]],
    ['ord_v15_engine.js',()=>(read('ord_v15_engine.js').match(/const VERSION='([\d.]+)'/)||[])[1]],
    ['ord_local_code_map.js',()=>(read('ord_local_code_map.js').match(/VERSION:\s*'([\d.]+)'/)||[])[1]],
    ['content-tmo.js',()=>(read('content-tmo.js').match(/const VERSION = '([\d.]+)'/)||[])[1]]
  ];
  for(const [label,get] of liveVersions){
    const found=get();
    assert(found,`${label} 에서 버전 상수를 찾지 못함 — 표기가 바뀌었으면 이 목록도 고칠 것`);
    assert.strictEqual(found,manifest.version,`${label} 버전이 ${found} — manifest ${manifest.version} 와 어긋남 (릴리스 때 같이 올릴 것)`);
  }
  // 사용자에게 보이는 제목도 같은 값이어야 한다.
  // v20.5.2: 처음엔 popup.html·content-tmo.js 만 걸었는데, 정작 사용자가
  // 계속 인용한 문자열(데스크톱 창 제목 표시줄)은 ord_helper_desktop.html
  // 의 <title> 이었다 — 검사에서 빠져 있었다.
  for(const [label,src] of [
    ['popup.html',read('popup.html')],
    ['content-tmo.js',read('content-tmo.js')],
    ['ord_helper_desktop.html',read('ord_helper_desktop.html')]
  ]) assert(src.includes(`코치 v${manifest.version}`),`${label} 의 화면 제목이 v${manifest.version} 이 아님`);
  // 데스크톱 창 제목은 <title> 그 자체다 — 본문 어딘가가 아니라 태그를 건다.
  const deskTitle=(read('ord_helper_desktop.html').match(/<title>([^<]*)<\/title>/)||[])[1];
  assert(deskTitle&&deskTitle.includes(`v${manifest.version}`),
    `데스크톱 창 제목이 "${deskTitle}" — v${manifest.version} 이어야 함 (사용자가 보는 유일한 버전 표시)`);
}

console.log(`PASS  manifest and MV3 CSP (${manifest.version})`);
console.log(`PASS  no OpenAI/localhost runtime surface`);
console.log(`PASS  data/recipe integrity (${units.length} units, ${units.filter(C.isUpper).length} upper variants)`);
console.log('PASS  primary 32172 + compatibility 34366 confidence connector');
console.log(`PASS  compact snapshot payload (${payloadBytes} bytes)`);
console.log(`PASS  standalone manual bundle (${manualScripts} inline scripts)`);
