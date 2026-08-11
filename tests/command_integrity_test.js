'use strict';
const assert=require('assert');
const path=require('path');
const ext=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js','ord_app.js'])require(path.join(ext,file));
const C=global.ORDCore,catalog=global.ORD_TMO_UNITS,app=Object.create(global.ORDApp.App.prototype);app.catalog=catalog;

for(const unit of catalog){
  const info=app.commandInfo(unit);
  assert(info.koreanDisplay,`${unit.id} Korean command field is empty`);
  assert(info.englishDisplay,`${unit.id} English command field is empty`);
}
const encoded=JSON.stringify(catalog.map(unit=>({name:unit.name,desc:unit.desc,commands:unit.commands})));
assert(!encoded.includes('\ufffd'),'catalog contains a replacement character');
assert(!/[\u0080-\u009f]/.test(encoded),'catalog contains a C1 control character');

// v23.0 재핀: 2312 카탈로그가 명령을 "한글 / 영문" 이중 표기로 완비했다 —
// A40h·G40h 도 이제 양쪽이 검증돼 실물 미확인 표본이 없다.  실물은 이중
// 표기 계약으로 핀하고, '조작 금지(미검증은 빈 값)' 계약은 합성 유닛으로
// 계속 검증한다.
const bothVerified=app.commandInfo(catalog.find(unit=>unit.id==='A40h'));
assert.match(bothVerified.korean,/대해적흰수염/);
assert.match(bothVerified.english,/newgate im/);
const bothVerified2=app.commandInfo(catalog.find(unit=>unit.id==='G40h'));
assert.match(bothVerified2.korean,/신념의흑완제트/);
assert.match(bothVerified2.english,/z im/i);

const englishMissing=app.commandInfo({id:'TEST_KO_ONLY',name:'테스트',commands:['대해적흰수염'],codes:['A40h']});
assert.match(englishMissing.korean,/대해적흰수염/);
assert.match(englishMissing.englishDisplay,/unverified/i);
assert.strictEqual(englishMissing.english,'','unverified English must not be fabricated');

const koreanMissing=app.commandInfo({id:'TEST_EN_ONLY',name:'테스트2',commands:['z im'],codes:['G40h']});
assert.match(koreanMissing.english,/z im/);
assert.match(koreanMissing.koreanDisplay,/한글 명령 미확인/);
assert.strictEqual(koreanMissing.korean,'','unverified Korean must not be fabricated');

const inherited=app.commandInfo(catalog.find(unit=>unit.id==='unit_1767356628978_5789'));
assert.strictEqual(inherited.inherited,true);
assert.strictEqual(inherited.sourceUnitId,'F90H');
assert.match(inherited.korean,/최강의검사/);
assert.match(inherited.english,/zoro tr/);

const noSeparate=app.commandInfo(catalog.find(unit=>unit.id==='I50h'));
assert.strictEqual(noSeparate.hasVerified,false);
assert.match(noSeparate.koreanDisplay,/별도 채팅 명령 자료 없음/);
assert.match(noSeparate.englishDisplay,/No separate chat command/);

console.log('PASS  bilingual command fields are always readable and never fabricate unverified commands');
console.log('PASS  inherited base-form commands and UTF-8 catalog integrity');
