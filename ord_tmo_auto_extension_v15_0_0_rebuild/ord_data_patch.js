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
// v19.7.1(외부 감사): 2.305 실측 수치 교정 — 오프라인 카탈로그가 낡은 값을
// 갖고 있던 항목.  (A)키드 이감 33 → 35 (ordsearch 현재 상세 기준).
const abilityPatches={
  '4B0H':{abilities:{'이동속도 감소':35},renameFrom:/이감33/,renameTo:'이감35'}
};
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
  'unit_1767884591387_9300':{renameFrom:/배2개제작/,renameTo:'모든 배 건조',desc:'2.310 개편: 초 일류 조선공(Z) — 조합식 선박 유닛에게 사용시 목재로 즉시 건조(해적선 2 · 발라티에/모비딕호 10 · 방주맥심/사운드써니호 15 · 레드포스호 20).'},
  'unit_1767884647613_2996':{abilities:{'공격력 증가':40},renameFrom:/공증버프/,renameTo:'공증버프40',desc:'2.310: 오라 공증 60% → 40% 하향.'},
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
  // 방주맥심 — v22.12.1(2.312R 맵 원본 A0BG/A0BH): 액티브에 스턴 1.2초가
  // 실존.  roleProfile stun 산입은 협의 대상(1.2초 액티브 ≠ 풀스턴 인분)
  // 이라 우선 원문만 밝힌다 — 맵데이터_분석_20260811.txt ⑤.
  'X30h':{desc:'2.312R 맵 원문: 액티브(마나150·800범위) 마법 215만 + 스턴 1.2초 + 마방 10% 감소 + 폭발형 10% 증폭 / 공격시 14%(600범위) 마법 20만 + 3초간 이감 30%.  스턴 1.2초는 아직 코치 스턴 인분에 미산입.'}
};
for(const unit of Array.isArray(global.ORD_TMO_UNITS)?global.ORD_TMO_UNITS:[]){
  const p2312=patch2312[unit.id];
  if(!p2312)continue;
  if(p2312.abilities)unit.abilities=Object.assign({},unit.abilities||{},p2312.abilities);
  if(p2312.renameFrom&&p2312.renameFrom.test(String(unit.name||'')))unit.name=String(unit.name).replace(p2312.renameFrom,p2312.renameTo);
  if(p2312.desc)unit.desc=(String(unit.desc||'').trim()?String(unit.desc)+'\n':'')+p2312.desc;
}
if(Array.isArray(global.ORD_TMO_UNITS)){const ids=new Set(global.ORD_TMO_UNITS.map(u=>u.id));for(const row of missingRows)if(!ids.has(row.id))global.ORD_TMO_UNITS.push(row);for(const unit of global.ORD_TMO_UNITS){const patch=liveIdentity[unit.id];if(patch)Object.assign(unit,patch);const abilityPatch=abilityPatches[unit.id];if(abilityPatch){unit.abilities=Object.assign({},unit.abilities||{},abilityPatch.abilities);if(abilityPatch.renameFrom&&abilityPatch.renameFrom.test(String(unit.name||'')))unit.name=String(unit.name).replace(abilityPatch.renameFrom,abilityPatch.renameTo);}const p2310=patch2310[unit.id];if(p2310){if(p2310.abilities)unit.abilities=Object.assign({},unit.abilities||{},p2310.abilities);if(p2310.renameFrom&&p2310.renameFrom.test(String(unit.name||'')))unit.name=String(unit.name).replace(p2310.renameFrom,p2310.renameTo);if(p2310.desc)unit.desc=(String(unit.desc||'').trim()?String(unit.desc)+'\n':'')+p2310.desc;}const extraCodes=codeAliases[unit.id];if(extraCodes){unit.codes=Array.isArray(unit.codes)?unit.codes:[];for(const code of extraCodes)if(!unit.codes.includes(code))unit.codes.push(code);}}}
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
  }
}
patchMemo(global.ORD_UPPER_MEMO);patchMemo(global.ORD_SYNERGY_MEMO);
})(window);
