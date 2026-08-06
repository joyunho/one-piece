'use strict';
// v20.0.0 계약 — 게임 2.310 대응 + Calm Command Deck 리뉴얼.
//
// 근거: tmo.gg/ko/posts/39095 (이미지 18장 전량 판독 — 오로성 개편·
// 방무 삭제·가반/베이비5 리뉴얼·특수함 개편·가이몬 신규·페루 하향).
// 개별 유닛 버프/너프 목록은 게시글 기준 "-- 준비중 --" — 공개되면 후속.
//
// ① 오로성 산수 — 코드값 = (개별 + 악몽 공통) 합산 재검증.
// ② 패치 유닛 역할 — 베이비5 암브·모건 광보잡·페루 공증 40.
// ③ 조인 완화 — 특수함 별명 변경에도 이름 머리로 붙는다.
// ④ 브랜딩 2.310 — 사용자 노출만, 데이터 출처(2.305 파싱)는 보존.
// ⑤ 리뉴얼 레이어 — Calm Command Deck 마커·히어로 골드·보라 중화.
const assert=require('assert'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(EXT,file),'utf8');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

global.window=global;
const warn=console.warn;console.warn=()=>{};
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
console.warn=warn;
const C=global.ORDCore,units=global.ORD_TMO_UNITS;

check('① 2.310 악몽 오로성 산수 — 합산 구조 재검증',()=>{
  const meta=C.BOSS_META;
  // 체젠: 기본 5만 + 공통 50만 (+새턴 30만).
  assert.deepStrictEqual(meta.goroseiBossRegenNewWorld,{base:50000,warcury:550000,nasjuro:550000,saturn:850000});
  // 보스 체력: 워큐리 개별 1500만+공통 1000만, 나머지 공통만.
  assert.deepStrictEqual(meta.goroseiBossHpBonusNewWorld,{warcury:25000000,saturn:10000000,nasjuro:10000000});
  // 라인몹 체력: 나스쥬로 개별 1500만+공통 1000만, 나머지 공통만.
  assert.deepStrictEqual(meta.goroseiMobHpBonusNewWorld,{saturn:10000000,nasjuro:25000000,warcury:10000000});
  // 워큐리 몹 방어 +15 → 방깎 목표 195/226.
  assert.deepStrictEqual(meta.goroseiMobArmorBonus,{warcury:15});
  assert.strictEqual(C.GOROSEI.warcury.armorSoft,195);
  assert.strictEqual(C.GOROSEI.warcury.armorSafe,226);
  // 역전 확인: 이제 60라 보스 요구 DPS는 워큐리 > 나스쥬로.
  assert(C.bossPreview(60,'warcury').dpsNeed>C.bossPreview(60,'nasjuro').dpsNeed,'2.310 보스 증가 대상 교체 미반영');
});

check('② 패치 유닛 역할 — 베이비5 암브 · 모건 광보잡 · 페루 공증 40',()=>{
  const byId=id=>units.find(u=>u.id===id);
  const baby=C.roleProfile(byId('N70h'));
  assert.strictEqual(baby.armorBreak,true,'베이비5 아머브레이크 없음');
  const morgan=C.roleContribution(byId('unit_1767884457709_1523'),'physical');
  assert.strictEqual(morgan.bossFrenzy,1,'모건 광보잡 크레딧 없음');
  assert(/광보잡/.test(byId('unit_1767884457709_1523').name),'모건 개명 없음');
  assert.strictEqual(C.num(byId('unit_1767884647613_2996').abilities['공격력 증가']),40,'페루 공증 하향 미반영');
  assert(/모든 배 건조/.test(byId('unit_1767884591387_9300').name),'아이스버그 개명 없음');
  // 가반: 조합 유닛 구성은 2.305와 동일(레이쥬+조로+샹크스) — 목재는
  // 원장 밖이라 stuffs 불변이 계약이다(모르는 id를 넣으면 제작 불가 오판).
  assert.deepStrictEqual((byId('F40h').stuffs||[]).map(s=>s.id).sort(),['330h','530h','S20h'],'가반 조합 유닛 구성 변형');
  assert(/2\.310 리뉴얼/.test(byId('F40h').desc||''),'가반 2.310 설명 없음');
  // 방무 라벨 폐기(타입 삭제) — 코치 라벨은 폭발딜로.
  const core=read('ord_core.js');
  assert(!core.includes('보조·방무딜'),'방무 라벨 잔존');
  assert(core.includes('보조·폭발딜'),'폭발딜 라벨 없음');
});

check('③ 특수함 조인 완화 — 2.310 별명 변경에도 붙는다',()=>{
  const src=read('content-tmo.js');
  assert(src.includes('re: /^모건/'),'모건 조인이 여전히 별명 괄호에 묶임');
  assert(src.includes('re: /^아이스버그/'),'아이스버그 조인이 여전히 별명 괄호에 묶임');
  // 가이몬(신규·id 미상)은 미해석 코드 안전망으로 관측 — 데이터 패치에
  // 억지 id를 만들지 않는다.
  assert(read('ord_data_patch.js').includes('가이몬'),'가이몬 경계 주석 없음');
  assert(!units.some(u=>/가이몬/.test(u.name||'')),'가이몬 억지 행 금지(id 미상)');
});

check('④ 브랜딩 2.310 — 사용자 노출만, 데이터 출처는 2.305 보존',()=>{
  assert(read('manifest.json').includes('원랜디 2.310'),'매니페스트 2.310 아님');
  const app=read('ord_app.js');
  assert(app.includes('악몽 실전 코치 · 2.310'),'상단 브랜드 2.310 아님');
  assert(app.includes("game:{version:'2.310'"),'런로그 게임 버전 2.310 아님');
  assert(app.includes('ORD_2310_${stamp}'),'저장 파일명 접두 2.310 아님');
  assert(read('tools/build_manual.js').includes("'ord_2310_nightmare_helper_v'"),'매뉴얼 접두 2.310 아님');
  // 출처 정직성: 맵 파싱·능력치 데이터는 여전히 2.305 계보 — 표기 유지.
  assert(read('ord_core.js').includes('2.305 [C] 맵 파싱'),'파싱 출처 표기 소실');
  assert(read('ord_core.js').includes("source:'2.305 abilities"),'능력치 출처 표기 소실');
});

check('⑤ 리뉴얼 레이어 — Calm Command Deck 마커·히어로 골드·보라 중화',()=>{
  const css=fs.readFileSync(path.join(EXT,'ord_cockpit_v15.css'),'utf8');
  const layer=css.slice(css.indexOf('Calm Command Deck'));
  assert(layer.length>1000,'리뉴얼 레이어 없음');
  assert(layer.includes('.v153-screen::before{display:none}'),'도트 격자 철거 없음');
  // 화면 유일의 금색 = 지금 할 일 승인 버튼.
  assert(layer.includes('.v151-action .primary{background:#b7873c'),'히어로 골드 없음');
  // 잔존 보라의 실측 중화(computed-style 인벤토리로 특정한 셀렉터들).
  for(const sel of ['.v154-rare-progress strong{color:#e8edf4}','.v153-craft-cards>button.recommended{background:#141922!important}','.v153-screen .primary,.v153-screen button.primary{background:#2e6cb5!important'])
    assert(layer.includes(sel),`중화 규칙 소실: ${sel}`);
  // 정책 우선순위 문구에 전제 명시.
  assert(read('ord_v15_policy.js').includes('상위 전제(체젠 등 필수 시)'),'정책 문구 전제 없음');
});

console.log(`\n${checks} checks passed (v20.0.0 — 2.310 대응·리뉴얼)`);
