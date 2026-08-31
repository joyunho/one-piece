'use strict';
// v23.0 — ord_units_data.js 재생성기.
//
// 원본: data/ord_catalog_2312_20260810.json (api.tmo.gg/posts/41824
// "개뿔 원랜디 2.312(가로)" 카탈로그, 31그룹/324유닛).  2.305 덤프를 이
// 카탈로그로 전면 교체한다 — 능력 수치·이름·그룹·조합식이 전부 2.312 기준.
//
// 채택 근거: 맵 전수 문서화본(ORDR_S2_2.312R)과의 대조 검증 —
// 맵데이터_분석_20260811.txt + data/ord_map_audit_2312R.json.
//
// 유지 필드: id,name,image,stuffs,codes,groupName,desc,abilities,commands
// (코치가 소비하는 전부).  parentUnitIds 는 stuffs 역방향으로 재계산한다
// (엔진 희귀 부모 조회가 사용).  2.305 덤프의 나머지 파생 필드
// (moreNeed*/lowestChildStuffs 등)는 어디서도 소비하지 않아 버린다.
//
// 실행: node tools/build_units_data_2312.js
const fs=require('fs'),path=require('path');
const REPO=path.join(__dirname,'..');
const CATALOG=path.join(REPO,'data/ord_catalog_2312_20260810.json');
const OUT=path.join(REPO,'archive/legacy_program/ord_units_data.js');

// 2312 카탈로그가 목록에서 뺐지만 코치가 계속 알아야 하는 항목.
// (A)카이도(용폼)은 M70h(불멸 카이도)의 조합 후 변신 폼이다 —
// UPPER_VARIANT_FAMILIES/COMMAND_INHERITANCE 가 이 id 를 참조하고, 라이브
// TMO 스냅샷이 활성 폼 id 로 실어온다.  2.305 덤프(git b2e1a45)에서 계승.
const LEGACY_CARRYOVER=[
  {"id":"unit_1767886180546_6011","name":"(A)카이도(용폼) 💖(이감60 공증-75 깍30 중첩)","image":"https://media.tmo.gg/production-46f3d19f-fb3b-4e2e-b5c1-4cca44a017b0","stuffs":[{"id":"M70h","count":1}],"codes":["DA0h"],"groupName":"불멸 [물딜]","desc":"2312 카탈로그 미등재 — 2.305 덤프 계승(불멸 카이도 변신 폼).","abilities":{"이동속도 감소":60,"중첩방어력 감소":30,"공격력 증가":-75,"바제스":"ture"},"commands":[],"parentUnitIds":[]}
];

const catalog=JSON.parse(fs.readFileSync(CATALOG,'utf8'));
const units=[];
for(const group of catalog.groups){
  for(const unit of group.units||[]){
    units.push({
      id:String(unit.id),
      name:String(unit.name||''),
      image:String(unit.image||''),
      stuffs:Array.isArray(unit.stuffs)?unit.stuffs.map(s=>({id:String(s.id),count:Number(s.count)||0})):[],
      codes:Array.isArray(unit.codes)?unit.codes.map(String):[],
      groupName:String(unit.groupName||group.name||''),
      desc:String(unit.desc||''),
      abilities:unit.abilities&&typeof unit.abilities==='object'?unit.abilities:{},
      commands:Array.isArray(unit.commands)?unit.commands:[],
      parentUnitIds:[]
    });
  }
}
for(const legacy of LEGACY_CARRYOVER){
  if(!units.some(u=>u.id===legacy.id))units.push(JSON.parse(JSON.stringify(legacy)));
}
const byId=new Map(units.map(u=>[u.id,u]));
for(const unit of units){
  for(const stuff of unit.stuffs){
    const child=byId.get(stuff.id);
    if(child&&!child.parentUnitIds.includes(unit.id))child.parentUnitIds.push(unit.id);
  }
}
const header='// 2.312 카탈로그 (api.tmo.gg/posts/41824 · '+String(catalog.postCreatedAt||'')+' 게시) — tools/build_units_data_2312.js 가 생성.\n'+
'// 수동 편집 금지 — 정정은 ord_data_patch.js 패치 레이어에 쓴다.\n';
fs.writeFileSync(OUT,header+'window.ORD_TMO_UNITS='+JSON.stringify(units)+';\n');
console.log('ord_units_data.js 생성:',units.length,'유닛 ·',Math.round(fs.statSync(OUT).size/1024)+'KB');
