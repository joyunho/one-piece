(function(global){
'use strict';
// v17.13: codes는 TMO API 실측 기록(data/tmo_api_histories_*)과의 조인 키 —
// 실전 로그에서 H50h/O50h/P50h로 관측됨(누락 시 실측 픽률 조인 미스).
const missingRows=[
  {id:'unit_1767885034730_2200',name:'미니 라분',groupName:'기타',abilities:{},stuffs:[],codes:[]},
  {id:'unit_1767884457709_1523',name:'모건 🚩1 (탐색)',groupName:'특수함',abilities:{},stuffs:[],codes:['H50h']},
  {id:'unit_1767884591387_9300',name:'아이스버그🚩2 (배2개제작)',groupName:'특수함',abilities:{},stuffs:[],codes:['O50h']},
  {id:'unit_1767884614234_8036',name:'오타마 (희귀함이하구매)',groupName:'특수함',abilities:{},stuffs:[],codes:['P50h']}
];
// v17.13.0 감사: TMO 판별 기록은 게임 종료 시점의 유닛 형태 코드를 남기므로
// 변신 상태 코드가 별도로 관측된다 — 쵸파 몬스터포인트 390H(실측 147판,
// 기본형 190H는 18판), 료쿠규 스택 변신 OB0H(실측 54판, 기본형 LB0H 64판).
// 코드 미보강 시 실측 조인이 실패해 해당 판들이 "상위 없음"으로 오분류된다.
const codeAliases={
  'unit_1747756917990_920':['390H'], // (A)쵸파 몬스터포인트 — 변신 상태 코드
  'LB0H':['OB0H'] // (S)료쿠규 — 스택 변신 상태 코드
};
const liveIdentity={
  'unit_1761061085749_3333':{name:'메구밍 (전퍼스킬)',groupName:'랜덤유닛',aliases:['메구밍','샌즈 전용 재료']},
  'unit_1761061102389_3':{name:'센토 이스즈 (바제스)',groupName:'랜덤유닛',aliases:['센토 이스즈','히그마 전용 재료']},
  'unit_1761061295036_310':{name:'옌',groupName:'랜덤유닛',aliases:['요우무 전용 재료']},
  'unit_1761061550524_6203':{name:'카미조 토우마(단일스턴/코비용기의외침)',groupName:'랜덤유닛',aliases:['카미조 토우마','죠타로 전용 재료']}
};
// v19.7.1(외부 감사): 2.305 실측 수치 교정 — (A)키드 이감 33→35 는
// v23.0 에서 은퇴.  2.312 카탈로그(새 베이스)가 33 으로 표기하고 이름
// 문자열 자체가 '이감33'이다 — v19.7 근거였던 ordsearch 상세는 2.305
// 시대의 것.  카탈로그가 더 새 정본이라 패치를 비워 둔다.
const abilityPatches={};
// v20.0(2.310 패치노트 tmo.gg/ko/posts/39095 판독): 오프라인 카탈로그는
// 2.305 덤프다 — 게시된 리뉴얼 중 역할 원장·표시에 닿는 항목만 손패치한다.
//  · 개별 유닛 버프/너프 목록은 게시글 기준 "-- 준비중 --" — 공개되면 후속.
//  · 가이몬(신규 특수함 — 보물 랜덤위습→선택위습)은 id/코드 미상 — TMO
//    카탈로그 갱신 전까지 미해석 코드 경로(unknownCodes)로만 관측된다.
//  · 방어무시 타입 전면 삭제(→폭발형)와 루치·시류·도플라밍고(변화)의
//    일반 마법 전환은 스킬 DPS 원자료(2305C JASS) 재파싱이 필요해 수치는
//    유지한다 — 역할 원장은 능력치 파싱이라 영향 없음.
const patch2310={
  // (변화)베이비5 — 암브 기반 물딜 유틸로 리뉴얼: 무기무기열매가 범위 1
  // 아머브레이크(최대 75중첩) 부여 + 과열(대상 아군 공속 150% 12초).
  // v22.10(사용자 실측 2.312): 이름의 (광보잡)도 실체와 어긋난다 — (암브)로
  // 교정.  광보잡 플래그 무효화는 ord_core.js roleProfile ID 교정이 담당.
  'N70h':{abilities:{'아머브레이크':1},renameFrom:/광보잡/,renameTo:'암브',desc:'2.310 리뉴얼: 암브 기반 물딜 유틸 — 무기무기열매 범위 1 아머브레이크(최대 75중첩) · 과열 가속(대상 아군 공속 150%, 12초, 쿨 50초).  2.312 사용자 실측: 광보잡 인분으로 세지 않는다.'},
  // (불멸)스코퍼 가반 — 스킬 전면 리뉴얼.  조합 유닛 구성(레이쥬+조로+
  // 샹크스)은 2.305와 동일하고 목재 10이 추가됐다 — 목재는 2.310 신규
  // 자원이라 코치 선위 원장 밖(게임에서 확인).
  'F40h':{desc:'2.310 리뉴얼: 산먹깨비(공격시 45% 단일 100만×1~3 물리 + 3초 스턴, 20회마다 부천락 추가발동) · 부천락(타입별 전체체력 비례 고정딜 — 라인/광폭 55%·보스 15%·스토리 10%) · 견문색 패기(공격력 25%↑, 기본공격 방깎 60·보스 70) · 참격(단일 875만×1~1.5 물리 + 라인 전체체력 20%). 특성강화 팔십효사. 조합에 목재 10 추가(목재는 게임 내 자원 — 코치 계산 밖).'},
  // 특수함 개편(등장 3%→1%, 성능 상향):
  'unit_1767884457709_1523':{abilities:{'보스 잡기':true,'광폭화':true},renameFrom:/탐색/,renameTo:'광보잡, 라인딜',desc:'2.310 개편: 탐색 삭제 → 도끼손(기본공격 11% 8배 크리 + 단일 0.8초 스턴, 11% 타입별 추가 고정딜 — 라인/스토리 2만·보스 현재체력 0.9%·광폭 전체체력 4.5%) — 신세계 이후 딜러.'},
  'unit_1767884591387_9300':{renameFrom:/배2개제작|배 제작/,renameTo:'모든 배 건조',desc:'2.310 개편: 초 일류 조선공(Z) — 조합식 선박 유닛에게 사용시 목재로 즉시 건조(해적선 2 · 발라티에/모비딕호 10 · 방주맥심/사운드써니호 15 · 레드포스호 20).'},
  // v23.0 유지: 2312 카탈로그는 페루 공증을 100 으로 싣지만 맵 원본
  // A0LR 툴팁이 "650범위 아군 유닛 공격력 40% 증가" — 카탈로그 오기.
  'unit_1767884647613_2996':{abilities:{'공격력 증가':40},renameFrom:/공증버프/,renameTo:'공증버프40',desc:'2.310: 오라 공증 60% → 40% 하향 (2.312R 맵 원본 A0LR 확정 40% — tmo 카탈로그의 100 은 오기).'},
  'unit_1767884539590_2352':{desc:'2.310 개편: 격려격려 열매::고무(Q) — 선택 아군 체력·마나 3초간 90 회복(쿨 100초) — 극대화 버퍼.'},
  'unit_1767884779838_643':{desc:'2.310: 공격 기능 추가.'}
};
// v22.12(웹 정본 — 공식 누적 패치노트 dcinside ordc1 no=189308 · 2.311/2.312
// 전문 확보): 역할 원장·표시에 닿는 항목만 손패치.  2.311/2.312 는 2.310
// 의 픽스 버전이라 골격은 patch2310 그대로다.
const patch2312={
  // (D)레베카(제한) — 발동이감 50→60 (2.311 시기 변경, 패치노트 미기재·
  // 커뮤니티 실측 dcinside 256727.  v22.12.1: 2.312R 맵 원본 A0TH 로 확정 —
  // 공격시 8%·850범위·2.5초간 60%.  급소분석 A0TF 는 750범위 방깎38 +
  // 공격시 33% 단일 3초 스턴).
  'I50h':{abilities:{'발동이동속도 감소':60},renameFrom:/발동이감50/,renameTo:'발동이감60',desc:'2.311 시기: 발동이감 50 → 60 (커뮤니티 실측 — 패치노트 미기재 변경 · 2.312R 맵 원본 확정: 공격시 8%·850범위·2.5초간 60%).  급소분석: 750범위 방깎 38 + 공격시 33% 확률 단일 3초 스턴(맵 원문).'},
  // (S)나미(초월) — 발이감 중첩 불가로 정리(2.311 시기 문의 직후 패치).
  'V80H':{desc:'2.311 시기: 발동이감은 중첩되지 않는 것으로 정리 — 다중 나미류 발이감 합산 금지.'},
  // (A)코비(초월) — 콤비네이션 어택 분신 공격력 12.5만 → 11만 (2.311 너프).
  'OC0H':{desc:'2.311: 콤비네이션 어택 분신 공격력 12만5000 → 11만 (너프).  방무뎀 타입은 2.310 에서 폭발형으로 전환 — 새턴 저주(폭뎀 -10%)와 상성 주의.'},
  // (A)우솝(초월) — 10톤해머 크리티컬 10% → 15% (2.311 툴팁 정정 = 실값 15%).
  'B90H':{desc:'2.311: 10톤해머 크리티컬 확률 10% → 15% (툴팁 정정 — 실값 15%).'},
  // 검은수염(초월) — 지진이 물리로 적용되던 버그 수정 → 마법뎀 정상화 (2.312).
  '090H':{desc:'2.312: 강진 데미지+현기증 미적용 버그 수정 · 지진 물리 적용 버그 수정(마법뎀 정상화).'},
  // 나미(전설) — v23.0(2.312R 맵 원본 A0AL 크리마텍트): 여진 이감 42%.
  // tmo 2312 카탈로그의 45 는 오기 — 맵 툴팁이 단일 레벨 42 로 확정.
  'P20h':{abilities:{'발동이동속도 감소':42},desc:'2.312R 맵 원본(A0AL 크리마텍트): 여진 3초간 이동속도 42% 감소 — 카탈로그 45 는 오기.'},
  // 조로(초월) — 귀기(A0QC)는 레벨형: 방깎·이감 30/35/42.  카탈로그 표기
  // 35(중간 레벨)를 기준값으로 유지하고 레벨 사실만 밝힌다.
  'F90H':{desc:'2.312R 맵 원본(A0QC 귀기): 레벨별 방깎·이감 30/35/42(패왕색) — 코치 수치는 카탈로그 기준 35.'},
  // 방주맥심 — v23.0(2.312R 맵 JASS 판독): 뇌영은 공격 카운터형(150타)
  // 자동 발동 — 실범위 600(툴팁 800 은 과장), 1.2초 스턴(보스급 0.24초),
  // 주기 96.6초(마젠 연구 시 ≈64초).  유효 스턴 0.05 인분으로 산입
  // (STUN_RESEARCH X30h).
  'X30h':{desc:'2.312R 맵 원문: 뇌영 — 공격 150타마다 자동 발동(마나=공격 카운터), 실범위 600, 마법 215만 + 스턴 1.2초(보스급 0.24초) + 마방 10% 감소 + 폭발형 10% 증폭 / 공격시 14% 마법 20만 + 3초간 이감 30%.  유효 스턴 0.05 인분 산입(마젠 연구 기준) — 스턴 전력이 아니라 광역 딜·마방깎 축.'},
  // 오타마 — v23.0(맵 원본 A0LQ): 카탈로그 desc 의 '받는 사람 목재 2'는
  // 오기 — 맵 원문은 '받은 사람 4 목재' (주는 사람 12 목재는 일치).
  'unit_1767884614234_8036':{desc:'2.312R 맵 원문(경단먹이기 Q): 희귀 이하 유닛 1기 영구 귀속(1회) — 주는 사람 목재 12, 받은 사람 목재 4 (카탈로그의 2 는 오기).'},
  // 카이도(불멸) — v23.0(맵 확인): 인간폼 h07M ↔ 용폼 h0AD 변신 유닛.
  // 이감60·중첩깎30·공증-75 는 두 폼 공유(A0Q1) — 카탈로그가 용폼 행을
  // 지웠어도 값은 M70h 에 보존된다.
  'M70h':{desc:'변신 유닛(물고기물고기 열매 F): 인간폼 ↔ 용폼 — 이감60·중첩방깎30·공증-75 는 두 폼 공유(2.312R 맵 A0Q1).'}
};
// v27.0(사용자 0826g: "싹다 유닛들 다시 확인해줘 2.314버전으로") — 공식 누적
// 패치노트(dcinside ordc1 no=189308 · 2.314 전문, 2.313 은 결번)와 2.312R 맵
// 원문 재검증으로 확정한 손패치.  게시 카탈로그(41824)는 2.312 에서 멈췄고
// 2.314 는 조합식 변경이 없어 베이스 카탈로그(id·stuffs·codes)는 유지한다.
const patch2314={
  // 미나토(신비) — 2.314: 섬광연무 툴팁 정정 — 마법데미지 3% 증폭이 아니라
  // 마법방어력 3 감소.  역할 축이 마뎀증 → 마방깎으로 옮겨 간다.
  'unit_1761062663657_987':{abilities:{'마법데미지 증폭':0,'마법방어력 감소':3},renameFrom:/마뎀증3/,renameTo:'마방깎3',desc:'2.314: 섬광연무 실적용 정정 — 마법데미지 3% 증폭이 아니라 마법방어력 3 감소.'},
  // (변화)베이비5 — 카탈로그 잔존 광보잡 플래그 정리.  2.310 공식 원문:
  // "보스, 광폭화 대상 추가데미지 기능 삭제 · 범위 아머브레이크 1 기능
  // 추가".  roleProfile ID 교정(ord_core)이 이미 무효화하지만, 라이브
  // 병합·원본 표시 표면에 옛 플래그가 남지 않게 카탈로그 층에서도 지운다.
  'N70h':{abilities:{'보스 잡기':false,'광폭화':false,'공격속도 증가':false},desc:'2.314 재확인(2.312R 맵 원문): 과열 — 공증 2만2500 + 공격시 285범위 2만2500 마뎀 · 가속(대상 아군 공속 150% 12초, 타 가속과 중복 불가, 쿨 50초) / 무기무기 Lv2 — 공격시 10%, 450범위 10만 마뎀 + 단일 7만 추가 + 범위 아머브레이크 1(최대 75중첩).  광보잡 아님.'},
  // (변화)도플라밍고 — 오버히트: 라인몹 현재체력 20% 폭발 → 25% 마법(2.310
  // 공식) · 단일 인분 0.6 → 0.5 (공식 도우미 125 · 감자 도우미 합치 표기).
  'S50h':{abilities:{'단일':0.5},renameFrom:/단일0\.6/,renameTo:'단일0.5',desc:'2.312R 맵 원문: 오버히트 — 공격시 10% 단일 20만 마뎀 + 라인몹 현재체력 25% 추가 마뎀(2.310 폭발→마법 전환) / 하늘귀신(공중이동) / 실실열매(공격시 10%, 400범위 10만 마뎀).'},
  // (변화)캐럿 — 일렉트리컬 루나: 타당 폭뎀증 1% 램프, 최대 25%(2.312R 맵
  // 원문).  카탈로그의 1 은 스택 단위 표기 — 발동 50%라 램프 도달이 빨라
  // 파티 폭뎀증 축은 도달 상한 25 로 세운다.
  'J70h':{abilities:{'폭발형 데미지 증폭':25},renameFrom:/폭뎀증1/,renameTo:'폭뎀증 램프25',desc:'2.312R 맵 원문: 일렉트리컬 루나 — 공격시 50%, 425범위 10만 폭발형 + 해당 범위 폭뎀증 1%씩 최대 25%까지 램프 / 고속 전격 — 공격시 50% 단일 35만 물리 + 0.45초 스턴 / 달빛걸음·달의사자(공중이동).'},
  // (변화)카쿠 — 람각::선 원문 명시(끝딜 0.5 산입 근거).
  'KC0h':{desc:'2.312R 맵 원문: 람각::선 — 자신 공속 33% + 공격시 15%, 500범위 30만 마뎀 + 라인몹 단일 전체체력 5% 추가 폭발형(끝딜 0.5 산입) / 월보(1500범위 순간이동, 쿨 5초).'},
  // (왜곡)페로나 — 홀로홀로 Lv2: 자기 라인존 폭뎀증 10%(2.312R 맵 원문 —
  // 카탈로그 불리언 표기를 실수치로 승격).
  '840h':{abilities:{'폭발형 데미지 증폭':10},desc:'2.312R 맵 원문: 홀로홀로 Lv2 — 915범위 이감 45% + 자기 라인존 폭뎀증 10% + 공중이동 / 네거티브 홀로우 — 기본 공격시 라인몹 삭제(비라인 단일 120만 폭발) / 카미카제 랩 — 마나 100, 500범위 225만 폭발 + 1.5초 스턴.'},
  // ── 이하 2.314 공식 패치노트 반영(역할 수치 무변 — desc 기록) ──
  'E30h':{desc:'2.314: 육식 체 — 20% 확률 20만 물뎀 → 15만5000 마뎀 · 지건 10만 → 12만5000 마뎀 (마법 전환).'},
  'unit_1752901441310_3608':{desc:'2.314: 발굽 로제오 발동확률 10% → 15%.'},
  'B30h':{desc:'2.314: 기선제압 — 단일 175% 추가 물리 → 단일 50% 추가 고정데미지.'},
  'X30h':{desc:'2.314: 뇌영 실범위 600 → 800 정상화(툴팁 일치) — 유효 스턴 인분 0.05 유지.'},
  '790H':{desc:'2.314: 아이스에이지 175만 → 225만 + 시전시간 0.5초 · 특성강화 성능 변경.'},
  'OC0H':{desc:'2.314: 콤비네이션 어택 분신 공격력 11만 → 10만 (재너프).'},
  'C40h':{desc:'2.314: 갤럭시 임펙트 — 1200만 + 전퍼 10% → 12% 물뎀 · 시전시간 0.65초 추가.'},
  '760h':{desc:'2.314: 라이브::신시대 실범위 900 → 800 (툴팁 정정).'},
  'C50h':{desc:'2.314: 패왕색의 패기 발동조건 범위 950 → 900 (툴팁 정정).'},
  'KB0H':{desc:'2.314: 조합 재료(루치·스네이크맨 초월)의 레벨·스탯 계승.'},
  'KB0H_':{desc:'2.314: 조합 재료(루치·스네이크맨 초월)의 레벨·스탯 계승.'},
  '480h':{desc:'2.314: 인술::분신 확률 저적용 버그 수정 — 실확률 정상화(상향).'},
  '040h':{desc:'2.314: 블링크 사거리 2000 으로 증가.'},
  'S10h':{desc:'2.314: 블링크 사거리 1500 으로 증가.'},
  'L20h':{desc:'2.314: 블링크 사거리 1500 으로 증가.'},
  'C20h':{desc:'2.314: 블링크 사거리 1500 으로 증가.'}
};
for(const unit of Array.isArray(global.ORD_TMO_UNITS)?global.ORD_TMO_UNITS:[]){
  const p2312=patch2312[unit.id];
  if(!p2312)continue;
  if(p2312.abilities)unit.abilities=Object.assign({},unit.abilities||{},p2312.abilities);
  if(p2312.renameFrom&&p2312.renameFrom.test(String(unit.name||'')))unit.name=String(unit.name).replace(p2312.renameFrom,p2312.renameTo);
  if(p2312.desc)unit.desc=(String(unit.desc||'').trim()?String(unit.desc)+'\n':'')+p2312.desc;
}
if(Array.isArray(global.ORD_TMO_UNITS)){const ids=new Set(global.ORD_TMO_UNITS.map(u=>u.id));const byId=new Map(global.ORD_TMO_UNITS.map(u=>[u.id,u]));for(const row of missingRows){if(!ids.has(row.id)){global.ORD_TMO_UNITS.push(row);continue;}
// v23.0: 2312 카탈로그가 이 유닛들을 직접 실으면서 추가 대신 병합이 됐다 —
// 실측 조인 코드(P50h 등)는 카탈로그가 비워 오면 여기서 보강한다.
const existing=byId.get(row.id);existing.codes=Array.isArray(existing.codes)?existing.codes:[];for(const code of row.codes||[])if(!existing.codes.includes(code))existing.codes.push(code);}
for(const unit of global.ORD_TMO_UNITS){const patch=liveIdentity[unit.id];if(patch)Object.assign(unit,patch);const abilityPatch=abilityPatches[unit.id];if(abilityPatch){unit.abilities=Object.assign({},unit.abilities||{},abilityPatch.abilities);if(abilityPatch.renameFrom&&abilityPatch.renameFrom.test(String(unit.name||'')))unit.name=String(unit.name).replace(abilityPatch.renameFrom,abilityPatch.renameTo);}const p2310=patch2310[unit.id];if(p2310){if(p2310.abilities)unit.abilities=Object.assign({},unit.abilities||{},p2310.abilities);if(p2310.renameFrom&&p2310.renameFrom.test(String(unit.name||'')))unit.name=String(unit.name).replace(p2310.renameFrom,p2310.renameTo);if(p2310.desc)unit.desc=(String(unit.desc||'').trim()?String(unit.desc)+'\n':'')+p2310.desc;}const p2314=patch2314[unit.id];if(p2314){if(p2314.abilities)unit.abilities=Object.assign({},unit.abilities||{},p2314.abilities);if(p2314.renameFrom&&p2314.renameFrom.test(String(unit.name||'')))unit.name=String(unit.name).replace(p2314.renameFrom,p2314.renameTo);if(p2314.desc)unit.desc=(String(unit.desc||'').trim()?String(unit.desc)+'\n':'')+p2314.desc;}const extraCodes=codeAliases[unit.id];if(extraCodes){unit.codes=Array.isArray(unit.codes)?unit.codes:[];for(const code of extraCodes)if(!unit.codes.includes(code))unit.codes.push(code);}}}
const synergy=global.ORD_SYNERGY_MEMO;if(synergy&&synergy.byUnitId){synergy.byUnitId['unit_1767886180546_6011']=31;synergy.byUnitId.KB0H_=34;}
function patchMemo(memo){
  for(const entry of memo&&memo.entries||[])for(const support of entry.supports||[]){const ids=support.unitIds||[],name=String(support.name||'');
    if(ids.includes('L30h')||/^써니호$/.test(name))support.specs='광폭화';
    if(ids.includes('unit_1779017164417_3162')||/S-베어|S 베어/.test(name))support.specs='마딜 끝딜, 유틸, 짤스턴0.25, 마뎀증4, 마방깎1';
    if(ids.includes('E30h')||/^코비$/.test(name))support.specs=String(support.specs||'').replace(/,?\s*마젠\s*1(?:\.0)?/g,'').replace(/마젠\s*1\.2/g,'');
    if(ids.includes('X30h')||/^방주맥심$/.test(name))support.specs='마방깎10, 폭뎀증10, 발동이감30, 바제스';
    if(ids.includes('unit_1779015610844_6407')||/^바제스$/.test(name)&&/왜곡/.test(support.type||''))support.specs='마딜 단일1';
    if(ids.includes('240h')||/^시노부$/.test(name))support.specs='끝딜, 보잡';
    if(ids.includes('S20h')||/^조로$/.test(name))support.specs='끝딜, 처형';
    if(ids.includes('V30h')||/^코알라$/.test(name)){support.type='왜곡됨/공용 유틸';support.specs='보조딜, 마젠3.25';}
    // v27.0(사용자: "이제 베이비 5는 광보잡이 아니고"): 2.305 시대 메모가
    // (변화)베이비5 를 '보잡, 광보잡'으로 실었다 — 2.310 공식 리뉴얼(광보잡
    // 삭제 · 암브 1 추가 · 가속 버프)로 교정.  reinforce 머리말도 함께.
    if(ids.includes('N70h')||/^베이비 5$/.test(name)){support.specs='암브(범위1·75중첩), 단일 공속버프150, 유틸';if(support.reinforce)support.reinforce=String(support.reinforce).replace(/^보잡, 광보잡/,'암브, 공속버프');}
  }
}
patchMemo(global.ORD_UPPER_MEMO);patchMemo(global.ORD_SYNERGY_MEMO);
})(window);
