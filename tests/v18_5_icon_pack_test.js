'use strict';

// v18.5: 아이콘 팩(ord_icons.js) 배선 회귀 테스트.
//
// 팩은 조용히 사라질 수 있는 종류의 의존이다 — v153Icon 이 팩에 없는 이름을
// 받으면 인라인 SVG 로 물러나므로, 팩 파일이 빠지거나 이름 매핑이 어긋나도
// 화면은 그려진다(그래서 눈으로는 안 보인다).  여기서 고정하는 것:
//   1. 생성물이 실제로 존재하고 32종을 담고 있다
//   2. 배포 대상 세 곳(확장 페이지·수동판 번들·테스트 픽스처)이 전부 읽는다
//   3. 화면에서 쓰는 이름이 전부 팩에 실재한다(오타 매핑 방지)
//   4. 외부 요청이 없다(MV3 CSP) — 전부 data: URI 다

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'ord_tmo_auto_extension_v15_0_0_rebuild');
const ICONS = path.join(EXT, 'ord_icons.js');

const tests = [];
let failed = 0;
function test(name, fn) { tests.push([name, fn]); }

test('생성물 존재 · 32종 · 전부 data: URI', () => {
  assert(fs.existsSync(ICONS), 'ord_icons.js 가 없습니다 — node tools/build_icon_pack.js');
  global.window = global;
  delete require.cache[require.resolve(ICONS)];
  require(ICONS);
  const pack = global.ORD_ICONS;
  assert(pack && typeof pack === 'object', 'window.ORD_ICONS 가 없음');
  const names = Object.keys(pack);
  assert.strictEqual(names.length, 32, `아이콘 수가 32종이 아님: ${names.length}`);
  for (const name of names) {
    assert(/^data:image\/png;base64,/.test(pack[name]), `외부 참조가 섞임: ${name}`);
    assert(pack[name].length > 200, `내용이 비어 보임: ${name}`);
  }
});

test('원본 PNG 와 생성물이 일치한다(재빌드 없이 쓰지 않게)', () => {
  const src = path.join(ROOT, 'assets', 'icon-pack', 'colored-64');
  assert(fs.existsSync(src), '아이콘 원본 폴더가 없습니다');
  const files = fs.readdirSync(src).filter((n) => n.endsWith('.png')).sort();
  const names = Object.keys(global.ORD_ICONS).sort();
  assert.deepStrictEqual(names, files.map((f) => f.replace(/\.png$/, '')),
    '원본과 생성물의 아이콘 목록이 다릅니다 — tools/build_icon_pack.js 를 다시 실행하세요');
});

test('배포 대상 세 곳이 전부 팩을 읽는다', () => {
  const helper = fs.readFileSync(path.join(EXT, 'ord_helper.html'), 'utf8');
  assert(helper.includes('ord_icons.js'), '확장 페이지가 팩을 읽지 않음');
  const build = fs.readFileSync(path.join(EXT, 'tools', 'build_manual.js'), 'utf8');
  assert(build.includes("'ord_icons.js'"), '수동판 번들이 팩을 포함하지 않음');
  const fixture = fs.readFileSync(path.join(ROOT, 'tests', 'ui_fixture.html'), 'utf8');
  assert(fixture.includes('ord_icons.js'), '테스트 픽스처가 팩을 읽지 않음 — UI 스모크가 SVG 폴백만 검사하게 된다');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert(/build_icon_pack\.js/.test(pkg.scripts.build), '빌드 파이프라인에 아이콘 굽기가 빠짐');
});

test('화면이 쓰는 아이콘 이름이 전부 팩에 실재한다', () => {
  const app = fs.readFileSync(path.join(EXT, 'ord_app.js'), 'utf8');
  // v153IconName 의 매핑 표에서 팩 파일명을 뽑아 실재 여부를 검사한다.
  const mapBlock = app.slice(app.indexOf('v153IconName(name){'), app.indexOf('v153IconSvg(name){'));
  assert(mapBlock, '아이콘 이름 매핑 표를 찾지 못함');
  const mapped = [...mapBlock.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).filter((v) => /^(ui|spec|unit|rare)-/.test(v));
  assert(mapped.length >= 20, `매핑이 예상보다 적음: ${mapped.length}`);
  for (const name of new Set(mapped)) {
    assert(global.ORD_ICONS[name], `팩에 없는 아이콘을 참조: ${name}`);
  }
  // 화면에서 호출하는 역할 이름도 전부 매핑을 타야 한다(폴백으로 새지 않게).
  const used = new Set([...app.matchAll(/v153Icon\('([a-z]+)'\)/g)].map((m) => m[1]));
  assert(used.size > 0, 'v153Icon 호출을 찾지 못함');
  for (const key of used) {
    assert(new RegExp(`\\b${key}:'`).test(mapBlock), `매핑 없는 아이콘 호출(SVG 로 샘): ${key}`);
  }
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n  ${error && error.message}`); }
}
console.log(`V18_5_ICON_PACK ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
