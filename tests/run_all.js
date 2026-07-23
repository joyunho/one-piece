'use strict';

const fs=require('fs');
const path=require('path');
const childProcess=require('child_process');

const files=fs.readdirSync(__dirname).filter(file=>file.endsWith('.js')&&file!=='run_all.js').sort();
if(!files.includes('layout_v140_static_test.js'))throw new Error('v14.0.0 layout regression test is missing');
if(!files.includes('lexicographic_support_ranking_test.js'))throw new Error('v14.0.0 lexicographic support-ranking regression test is missing');
if(!files.includes('story_group_ranking_v140_test.js'))throw new Error('v14.0.0 story-league ranking regression test is missing');
for(const file of ['run_log_v140_test.js','run_log_compactor_v141_test.js','run_log_app_integration_test.js']){
  if(!files.includes(file))throw new Error(`v14.0.0 run-log regression test is missing: ${file}`);
}
let failed=0,skipped=0;
for(const file of files){
  const result=childProcess.spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:'utf8',timeout:120000});
  const ok=result.status===0;
  // v17.6(감사): 종료 코드 0이라도 SKIP을 선언한 테스트는 PASS로 위장
  // 집계하지 않는다 — 브라우저 없는 환경에서 76개 실검증이 77 PASS로
  // 보이던 문제.  CI에서 강제하려면 ORD_REQUIRE_ALL=1로 실패 처리.
  const skippedRun=ok&&/^SKIP\b/m.test(result.stdout||'');
  if(!ok)failed++;else if(skippedRun)skipped++;
  const last=(result.stdout||'').trim().split(/\r?\n/).slice(-3).join(' | ');
  process.stdout.write(`${ok?(skippedRun?'SKIP':'PASS'):'FAIL'} ${file}${last?` :: ${last}`:''}\n`);
  if(!ok)process.stdout.write(`${result.stdout||''}${result.stderr||''}`);
}
process.stdout.write(`\nTEST_FILES ${files.length-failed-skipped}/${files.length} passed${skipped?`, ${skipped} skipped`:''}\n`);
if(skipped&&process.env.ORD_REQUIRE_ALL==='1'){process.stdout.write('ORD_REQUIRE_ALL=1: skipped tests are failures\n');process.exit(1);}
process.exit(failed?1:0);
