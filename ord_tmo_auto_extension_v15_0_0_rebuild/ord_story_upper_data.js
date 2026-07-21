(function(global){
'use strict';

// ORD 2.305 upper-unit story-destruction ranking transcribed from the
// eight source tables. Ranks 1-14 are clear times (lower is faster), while
// ranks 15-80 are destruction percentages (higher is faster).
//
// A catalog unit can have more than one measured state. Those source rows
// stay intact in `variants`; the top-level fields prefer the ordinary/base
// state so an untracked enhancement is not treated as always active.
const rows=[
  ['unit_1761065051171_5253',1,'신비','료우기시키','seconds',15.87,'','measured'],
  ['F40h',2,'불멸','가반','seconds',19.89,'','measured'],
  ['unit_1761123072631_5561',3,'신비','부릉냐','seconds',22.50,'','measured'],
  ['unit_1761122598665_345',4,'신비','쿠치키 바쿠야','seconds',24.63,'','measured'],
  ['unit_1761123532798_5416',5,'신비','샌즈(강화)','seconds',26.76,'풀스택 뼈 강화','enhanced'],
  ['090H',6,'초월','검은수염','seconds',33.94,'','measured'],
  ['590H',7,'초월','아카이누','seconds',35.95,'','measured'],
  ['760h',8,'영원','우타','seconds',39.71,'우타의헤드셋 ON','measured'],
  ['Q40h',9,'불멸','빅맘','seconds',45.84,'영혼 5스택 세팅','measured'],
  ['H90H',10,'초월','상디','seconds',46.19,'','measured'],
  ['KB0H',11,'영원','니카','seconds',52.36,'태양신의 흔적 ON','measured'],
  ['B50h',12,'영원','카벤딧슈','seconds',53.84,'','measured'],
  ['G40h',13,'불멸','제파','seconds',54.43,'편차 매우 큼','measured'],
  ['W80H',14,'초월','루치','seconds',56.17,'300골 세팅','measured'],
  ['A90H',15,'초월','징베','percent',99.76,'','measured'],
  ['G50h',16,'제한','레드필드','percent',97.72,'','measured'],
  ['B40h',17,'불멸','시키','percent',96.59,'해적선 3 도핑 / 편차 큼','measured'],
  ['950h',18,'영원','에이스','percent',96.40,'','measured'],
  ['5B0H',19,'초월','키자루','percent',87.90,'분신 3 세팅','measured'],
  ['D40h',20,'불멸','드래곤','percent',85.58,'편차 매우 큼','measured'],
  ['C40h',21,'불멸','거프','percent',82.34,'버프 없음','measured'],
  ['R80h',22,'영원','오뎅','percent',82.28,'킨에몬 X','measured'],
  ['V80H',23,'초월','나미','percent',82.12,'','measured'],
  ['990H',24,'초월','루피','percent',81.22,'','measured'],
  ['unit_1761062663657_987',25,'신비','나미카제 미나토','percent',79.56,'','measured'],
  ['690H',26,'초월','로우','percent',78.52,'','measured'],
  ['N50H',27,'초월','타시기','percent',75.95,'','measured'],
  ['M70h',28,'불멸','카이도','percent',71.88,'','measured'],
  ['4B0H',29,'초월','키드','percent',71.27,'편차 큼','measured'],
  ['unit_1761125536417_8071',30,'신비','쿠죠 죠타로','percent',71.06,'','measured'],
  ['J40h',31,'불멸','로저','percent',71.00,'카무사리 1회','measured'],
  ['750h',32,'영원','비비','percent',70.93,'강화 3 세팅','measured'],
  ['E50h',33,'제한','에넬','percent',70.87,'','measured'],
  ['JC0h',34,'영원','류마(강화)','percent',67.35,'100스택 + 슈스이','enhanced'],
  ['2B0H',35,'초월','루피 기어포스','percent',66.62,'','measured'],
  ['unit_1761126565030_3924',36,'신비','히그마','percent',63.79,'','measured'],
  ['DB0H',37,'초월','야마토','percent',60.76,'','measured'],
  ['Y80H',38,'초월','프랑키(소환)','percent',60.69,'써니호 2대 ON','measured'],
  ['Z80H',39,'초월','샹크스','percent',59.41,'카무사리 1회','measured'],
  ['A40h',40,'불멸','흰수염','percent',58.31,'','measured'],
  ['JC0h',41,'영원','류마','percent',58.17,'100스택 세팅','base'],
  ['XB0H',42,'초월','보니','percent',57.17,'','measured'],
  ['I70h',43,'제한','카타쿠리','percent',57.15,'','measured'],
  ['B90H',44,'초월','우솝','percent',56.98,'우솝 해머 X','measured'],
  ['unit_1767356628978_5789',45,'초월','조로(염왕)','percent',56.31,'슈스이로 강화','measured'],
  ['E40h',46,'불멸','센고쿠','percent',54.89,'','measured'],
  ['F90H',47,'초월','조로','percent',53.12,'','measured'],
  ['290H',48,'초월','사보','percent',52.90,'','measured'],
  ['C50h',49,'영원','핸콕','percent',52.60,'','measured'],
  ['850h',50,'영원','미호크','percent',51.42,'','measured'],
  ['480h',51,'제한','시노부','percent',46.48,'','measured'],
  ['940h',52,'불멸','레일리','percent',45.75,'','measured'],
  ['I90H',53,'초월','브룩','percent',44.38,'아기라분 ON','measured'],
  ['unit_1761124487227_5978',54,'신비','야쿠모 유카리','percent',43.21,'','measured'],
  ['unit_1761125103588_3868',55,'신비','콘파쿠 요우무','percent',42.67,'','measured'],
  ['O80h',56,'제한','마르코(마딜)','percent',41.28,'인간 폼 + 깃털','measured'],
  ['unit_1761060002112_2027',57,'불멸','불릿(풀강)','percent',41.28,'올 레전더리','enhanced'],
  ['IA0h',58,'제한','킹','percent',40.01,'편차 큼','measured'],
  ['E90H',59,'초월','도플라밍고','percent',37.78,'','measured'],
  ['unit_1761062338921_7460',60,'신비','고죠 사토루','percent',35.77,'','measured'],
  ['U80H',61,'초월','시라호시','percent',34.68,'','measured'],
  ['A50h',62,'영원','버기','percent',32.45,'추진 풀업','measured'],
  ['unit_1767356778906_9384',63,'영원','테조로','percent',32.34,'10만 골드 세팅','measured'],
  ['OC0H',64,'초월','코비','percent',31.10,'버프 없음','measured'],
  ['LB0H',65,'초월','료쿠규','percent',31.05,'양분 10스택','measured'],
  ['unit_1745689336668_9114',66,'제한','마르코(물딜)','percent',28.18,'불사조 폼 + 깃털','measured'],
  ['F50h',67,'제한','크로커다일','percent',25.58,'편차 큼','measured'],
  ['X80H',68,'초월','후지토라','percent',25.05,'','measured'],
  ['190H',69,'초월','쵸파','percent',23.37,'','measured'],
  ['040h',70,'제한','아인','percent',21.88,'','measured'],
  ['490H',71,'초월','바질호킨스','percent',20.86,'미니 스트로맨 ON','measured'],
  ['unit_1761060002112_2027',72,'불멸','불릿(노강)','percent',17.86,'강화 X','base'],
  ['unit_1761121532012_4070',73,'신비','네즈코','percent',16.56,'','measured'],
  ['unit_1761124124692_6834',74,'신비','아냐 포저','percent',16.08,'','measured'],
  ['790H',75,'초월','아오키지','percent',15.88,'','measured'],
  ['I50h',76,'제한','레베카','percent',15.53,'','measured'],
  ['unit_1761126198374_11',77,'신비','타츠마키','percent',14.93,'','measured'],
  ['890H',78,'초월','로빈','percent',14.78,'','measured'],
  ['Q80h',79,'제한','알비다','percent',7.37,'','measured'],
  ['unit_1761123532798_5416',80,'신비','샌즈','percent',4.62,'강화 X','base']
];

const buckets={};
for(const [id,rank,imageTier,displayName,metricType,value,note,stateKey] of rows){
  const variant=Object.freeze({
    id,rank,tableTier:Math.ceil(rank/10),imageTier,displayName,metricType,
    value,approximate:false,note,stateKey
  });
  (buckets[id]||(buckets[id]=[])).push(variant);
}

const data={};
for(const [id,sourceVariants] of Object.entries(buckets)){
  const variants=Object.freeze(sourceVariants.slice().sort((a,b)=>a.rank-b.rank));
  const representative=variants.find(row=>row.stateKey==='base')||variants[0];
  data[id]=Object.freeze(Object.assign({},representative,{variants}));
}

// The source table says only "니카". Both TMO catalog rows are the same
// measured unit reached through different prerequisite paths.
data.KB0H_=Object.freeze(Object.assign({},data.KB0H,{
  id:'KB0H_',aliasOf:'KB0H',variants:Object.freeze([])
}));

global.ORD_STORY_UPPER_V2305=Object.freeze(data);
})(typeof window!=='undefined'?window:globalThis);
