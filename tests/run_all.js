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
let failed=0;
for(const file of files){
  const result=childProcess.spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:'utf8',timeout:120000});
  const ok=result.status===0;
  if(!ok)failed++;
  const last=(result.stdout||'').trim().split(/\r?\n/).slice(-3).join(' | ');
  process.stdout.write(`${ok?'PASS':'FAIL'} ${file}${last?` :: ${last}`:''}\n`);
  if(!ok)process.stdout.write(`${result.stdout||''}${result.stderr||''}`);
}
process.stdout.write(`\nTEST_FILES ${files.length-failed}/${files.length} passed\n`);
process.exit(failed?1:0);
