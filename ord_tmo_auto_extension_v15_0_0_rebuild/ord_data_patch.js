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
if(Array.isArray(global.ORD_TMO_UNITS)){const ids=new Set(global.ORD_TMO_UNITS.map(u=>u.id));for(const row of missingRows)if(!ids.has(row.id))global.ORD_TMO_UNITS.push(row);for(const unit of global.ORD_TMO_UNITS){const patch=liveIdentity[unit.id];if(patch)Object.assign(unit,patch);const abilityPatch=abilityPatches[unit.id];if(abilityPatch){unit.abilities=Object.assign({},unit.abilities||{},abilityPatch.abilities);if(abilityPatch.renameFrom&&abilityPatch.renameFrom.test(String(unit.name||'')))unit.name=String(unit.name).replace(abilityPatch.renameFrom,abilityPatch.renameTo);}const extraCodes=codeAliases[unit.id];if(extraCodes){unit.codes=Array.isArray(unit.codes)?unit.codes:[];for(const code of extraCodes)if(!unit.codes.includes(code))unit.codes.push(code);}}}
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
