'use strict';
// ORD 악몽 보드 — 전수 게이트 (v29.0.0 재편).
//
// v28 전면 신작 이후 살아 있는 계약은 신작 보드 + 데스크톱 셸이다.
// 옛 프로그램의 테스트 175벌은 archive/legacy_tests/ 에 동결됐다
// (v28.1.0 · 커밋 6ee5961 에서 전부 초록 — 재실행하려면 경로 조정 필요).
//
// 관례 유지: tests/*.js 전수 실행, 앵커 소실 검출, ORD_REQUIRE_ALL=1 이면
// SKIP 도 실패, 마지막 줄 "TEST_FILES X/Y passed".

const fs=require('fs');
const path=require('path');
const childProcess=require('child_process');

const files=fs.readdirSync(__dirname).filter(file=>file.endsWith('.js')&&file!=='run_all.js').sort();
// 앵커 — 신작 계약이 사라지면 스위트가 스스로 실패한다.
for(const file of ['ord_board_data_test.js','ord_board_solver_test.js','ord_board_core_test.js','ord_board_ui_test.js','shell_contract_test.js']){
  if(!files.includes(file))throw new Error(`핵심 회귀 테스트가 사라짐: ${file}`);
}

let failed=0,skipped=0,passed=0;
const summaries=[];
for(const file of files){
  const result=childProcess.spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:'utf8',timeout:300000});
  const out=`${result.stdout||''}${result.stderr||''}`;
  const lines=out.split('\n').map(line=>line.trim()).filter(Boolean);
  const tail=lines.slice(-3).join(' | ');
  const wasSkipped=/^SKIP/m.test(out)&&result.status===0;
  if(result.status===0&&!wasSkipped){passed+=1;console.log(`PASS ${file} :: ${tail}`);}
  else if(wasSkipped){skipped+=1;console.log(`PASS(부분SKIP) ${file} :: ${tail}`);}
  else{failed+=1;console.log(`FAIL ${file}`);console.log(out.split('\n').slice(-25).join('\n'));}
  summaries.push({file,status:result.status});
}
console.log('');
console.log(`TEST_FILES ${passed}/${files.length} passed${skipped?`, ${skipped} skipped`:''}`);
if(process.env.ORD_REQUIRE_ALL==='1'&&skipped>0){console.log('ORD_REQUIRE_ALL=1: skipped tests are failures');process.exit(1);}
if(failed>0)process.exit(1);
