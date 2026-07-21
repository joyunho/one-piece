(function(global){
'use strict';
const missingRows=[
  {id:'unit_1767885034730_2200',name:'미니 라분',groupName:'기타',abilities:{},stuffs:[]},
  {id:'unit_1767884457709_1523',name:'모건 🚩1 (탐색)',groupName:'특수함',abilities:{},stuffs:[]},
  {id:'unit_1767884591387_9300',name:'아이스버그🚩2 (배2개제작)',groupName:'특수함',abilities:{},stuffs:[]},
  {id:'unit_1767884614234_8036',name:'오타마 (희귀함이하구매)',groupName:'특수함',abilities:{},stuffs:[]}
];
const liveIdentity={
  'unit_1761061085749_3333':{name:'메구밍 (전퍼스킬)',groupName:'랜덤유닛',aliases:['메구밍','샌즈 전용 재료']},
  'unit_1761061102389_3':{name:'센토 이스즈 (바제스)',groupName:'랜덤유닛',aliases:['센토 이스즈','히그마 전용 재료']},
  'unit_1761061295036_310':{name:'옌',groupName:'랜덤유닛',aliases:['요우무 전용 재료']},
  'unit_1761061550524_6203':{name:'카미조 토우마(단일스턴/코비용기의외침)',groupName:'랜덤유닛',aliases:['카미조 토우마','죠타로 전용 재료']}
};
if(Array.isArray(global.ORD_TMO_UNITS)){const ids=new Set(global.ORD_TMO_UNITS.map(u=>u.id));for(const row of missingRows)if(!ids.has(row.id))global.ORD_TMO_UNITS.push(row);for(const unit of global.ORD_TMO_UNITS){const patch=liveIdentity[unit.id];if(patch)Object.assign(unit,patch);}}
const synergy=global.ORD_SYNERGY_MEMO;if(synergy&&synergy.byUnitId){synergy.byUnitId['unit_1767886180546_6011']=31;synergy.byUnitId.KB0H_=34;}
function patchMemo(memo){
  for(const entry of memo&&memo.entries||[])for(const support of entry.supports||[]){const ids=support.unitIds||[],name=String(support.name||'');
    if(ids.includes('L30h')||/^써니호$/.test(name))support.specs='광폭화';
    if(ids.includes('unit_1779017164417_3162')||/S-베어|S 베어/.test(name))support.specs='공용 유틸, 짤스턴0.25, 마뎀증8, 마방깎1 · 끝딜 자료확인';
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
