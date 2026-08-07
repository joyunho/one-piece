'use strict';

const fs=require('fs');
const path=require('path');
const childProcess=require('child_process');

const files=fs.readdirSync(__dirname).filter(file=>file.endsWith('.js')&&file!=='run_all.js').sort();
// v19.5(점검 결함): 필수 목록이 v14 시절 6개뿐이라 v15~v19 핵심 테스트를
// 지워도 무검출이었다 — 시대별 앵커를 추가한다.
for(const file of ['ui_smoke_test.js','coach_p0_ui_contract_test.js','connector_v13_tests.js','package_validation.js','v18_replay_gate_test.js','v19_second_upper_test.js']){
  if(!files.includes(file))throw new Error(`핵심 회귀 테스트가 사라짐: ${file}`);
}
if(!files.includes('layout_v140_static_test.js'))throw new Error('v14.0.0 layout regression test is missing');
if(!files.includes('lexicographic_support_ranking_test.js'))throw new Error('v14.0.0 lexicographic support-ranking regression test is missing');
if(!files.includes('story_group_ranking_v140_test.js'))throw new Error('v14.0.0 story-league ranking regression test is missing');
for(const file of ['run_log_v140_test.js','run_log_compactor_v141_test.js','run_log_app_integration_test.js']){
  if(!files.includes(file))throw new Error(`v14.0.0 run-log regression test is missing: ${file}`);
}
// v18: 실전 로그 6판을 통째로 재생하는 회귀 게이트는 살아 있는 엔진에
// 350여 라운드를 먹이므로 기본 2분 안에 끝나지 않는다(실측 ~150초).
// 느린 게 정상인 테스트와 멈춘 테스트를 구분하기 위해 파일별로 예산을 준다.
// v20.4: 재생 게이트 예산 600초 → 900초.  테스트가 느려진 게 아니라
// **재생하는 판이 늘었다** — v20.3 에서 0806a·0806b 를 등재해 13판 → 15판이
// 됐고(판당 약 40초), v20.4 에서 HOLD·회복 목표 라운드가 카드를 만들면서
// 라운드당 견적이 하나씩 늘었다.  600초는 15판 기준으로 여유가 없어
// 내용과 무관한 타임아웃 FAIL 이 났다(계약은 standalone 에서 8/8 통과).
// 판을 더 등재하면 이 값도 같이 올려야 한다 — 판당 40초 + 여유 30%.
const SLOW_TESTS=Object.freeze({'v18_replay_gate_test.js':900000});
let failed=0,skipped=0;
for(const file of files){
  // v19.5(점검 결함): 기본 maxBuffer(1MB) 초과가 내용과 무관한 FAIL 이 되던
  // 것 — 재생 계열 테스트의 장황한 출력을 16MB 까지 허용한다.
  const result=childProcess.spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:'utf8',timeout:SLOW_TESTS[file]||120000,maxBuffer:16*1024*1024});
  const ok=result.status===0;
  // v17.6(감사): 종료 코드 0이라도 SKIP을 선언한 테스트는 PASS로 위장
  // 집계하지 않는다 — 브라우저 없는 환경에서 76개 실검증이 77 PASS로
  // 보이던 문제.  CI에서 강제하려면 ORD_REQUIRE_ALL=1로 실패 처리.
  // v19.5(점검 결함): 부분 스킵과 전체 스킵을 구분한다 — PASS 를 하나라도
  // 찍었으면 실검증이 돌았으므로 PASS(부분SKIP)로 집계하고, PASS 없이
  // SKIP 만 찍은 파일만 SKIP 으로 뺀다.  stderr 로만 알린 스킵도 잡는다.
  const output=(result.stdout||'')+(result.stderr||'');
  const declaredSkip=/^SKIP\b/m.test(output);
  const ranAnything=/^PASS\b/m.test(output);
  const skippedRun=ok&&declaredSkip&&!ranAnything;
  const partialSkip=ok&&declaredSkip&&ranAnything;
  if(!ok)failed++;else if(skippedRun)skipped++;
  const last=(result.stdout||'').trim().split(/\r?\n/).slice(-3).join(' | ');
  process.stdout.write(`${ok?(skippedRun?'SKIP':partialSkip?'PASS(부분SKIP)':'PASS'):'FAIL'} ${file}${last?` :: ${last}`:''}\n`);
  if(!ok)process.stdout.write(`${result.stdout||''}${result.stderr||''}`);
}
process.stdout.write(`\nTEST_FILES ${files.length-failed-skipped}/${files.length} passed${skipped?`, ${skipped} skipped`:''}\n`);
if(skipped&&process.env.ORD_REQUIRE_ALL==='1'){process.stdout.write('ORD_REQUIRE_ALL=1: skipped tests are failures\n');process.exit(1);}
process.exit(failed?1:0);
