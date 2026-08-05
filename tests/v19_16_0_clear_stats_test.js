'use strict';
// v19.16.0 계약 — 클리어 조합 실측 채굴 (전수 랭킹 91,833판).
//
// "게임 로그는 단시간에 못 늘리니 다른 방법" → 이미 보유한 전수 랭킹
// 데이터의 판별 최종 유닛 구성(클리어 라벨 포함)을 역할 원장으로
// 재해석했다.  용도 경계: 표시·경고 전용 — 게이트·목표 자동 교체 금지.
//
// ① 다이제스트 무결성: 표본 규모·백분위 순서·파트너 점유율.
// ② 실측 정합(0805 사건 검증): 키드 클리어의 파트너 1위는 모비딕호,
//    체젠 중앙값 ≥1 — "체젠 0.45로 죽은 판"이 실측으로 설명된다.
//    빅맘 이감 중앙값은 나스쥬로 목표(117) 근방 — 손튜닝 목표 실증.
// ③ 소비 배선: core.clearStatsFor · 후보 카드 · 확정 상위 실측 감사.
const assert=require('assert'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(EXT,file),'utf8');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

const source=read('ord_clear_stats.js');
const digest=JSON.parse(source.slice(source.indexOf('=')+1,source.lastIndexOf(';')));

check('① 다이제스트 무결성 — 규모·백분위 순서·용도 경계',()=>{
  assert(digest.usable>90000,`사용 표본이 너무 작음: ${digest.usable}`);
  assert(Object.keys(digest.byUpper).length>=50,'상위 커버리지 부족');
  assert(String(digest.purpose).includes('게이트')&&String(digest.purpose).includes('금지'),'용도 경계 문구 없음');
  for(const [canonical,row] of Object.entries(digest.byUpper)){
    assert(row.games>=digest.minGames,`${canonical} 표본 미달`);
    for(const [key,p] of Object.entries(row.roles))
      assert(p.p10<=p.p25+1e-9&&p.p25<=p.p50+1e-9&&p.p50<=p.p75+1e-9,`${canonical}.${key} 백분위 역전`);
    let prev=Infinity;
    for(const partner of row.partners){
      assert(partner.share>0&&partner.share<=100&&partner.share<=prev+1e-9,`${canonical} 파트너 점유율 이상`);
      prev=partner.share;
    }
  }
  // 재현 빌드: 도구에 비결정 입력 없음.
  const tool=fs.readFileSync(path.join(ROOT,'tools/build_clear_stats.js'),'utf8');
  assert(!/Date\.now|Math\.random/.test(tool),'빌더에 비결정 입력');
});

check('② 실측 정합 — 키드 파트너 1위 모비딕호·체젠 p50, 빅맘 이감 117 근방',()=>{
  const kid=Object.values(digest.byUpper).find(row=>row.name.includes('키드'));
  assert(kid&&kid.games>1000,'키드 표본 없음');
  assert(kid.partners[0].name.includes('모비딕'),`키드 파트너 1위가 모비딕호가 아님: ${kid.partners[0].name}`);
  assert(kid.partners[0].share>50,'모비딕호 점유율 급락 — 채굴 방식 점검');
  assert(kid.roles.regen.p50>=1,`키드 체젠 p50 이상: ${kid.roles.regen.p50}`);
  const bigmom=Object.values(digest.byUpper).find(row=>row.name.includes('빅맘'));
  assert(bigmom&&bigmom.roles.slow.p50>=100&&bigmom.roles.slow.p50<=130,`빅맘 이감 p50 이탈: ${bigmom.roles.slow.p50}`);
});

check('③ 소비 배선 — core·후보 카드·확정 상위 감사·빌드 체인',()=>{
  global.window=global;
  for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_clear_stats.js','ord_core.js'])require(path.join(EXT,file));
  const C=global.ORDCore;
  const kidStats=C.clearStatsFor('4B0H');
  assert(kidStats&&kidStats.games>1000,'clearStatsFor 키드 실패');
  assert.strictEqual(C.clearStatsFor('없는상위'),null,'미등록 상위는 null');
  const app=read('ord_app.js');
  assert(app.includes('클리어 조합 실측')&&app.includes('실측 파트너'),'후보 카드 실측 라인 없음');
  assert(app.includes('v1916-clear-audit')&&app.includes('실측 하위25% 선'),'확정 상위 실측 감사 없음');
  for(const page of ['ord_helper.html','ord_helper_desktop.html'])
    assert(read(page).includes('ord_clear_stats.js'),`${page} 스크립트 누락`);
  assert(fs.readFileSync(path.join(ROOT,'package.json'),'utf8').includes('build_clear_stats.js'),'빌드 체인 누락');
  const css=read('ord_cockpit_v15.css');
  assert(css.includes('.v1916-clear-audit'),'실측 감사 스타일 없음');
});

console.log(`\n${checks} checks passed (v19.16.0 클리어 실측 채굴)`);
