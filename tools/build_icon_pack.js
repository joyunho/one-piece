#!/usr/bin/env node
// assets/icon-pack 의 PNG 를 확장이 읽는 단일 모듈 ord_icons.js 로 굽는다.
//
// 왜 base64 모듈인가 — 배포 대상이 둘이고 제약이 서로 다르다.
//   확장(MV3): 외부 요청이 CSP 로 막힌다. 패키지 안 파일은 되지만 경로가 는다.
//   수동판:    단일 HTML 파일이라 상대 경로 이미지가 아예 없다.
// 스크립트 하나로 구우면 확장은 기존 스크립트 목록에 한 줄 추가로 끝나고,
// 수동판은 build_manual 이 다른 스크립트와 똑같이 인라인해 준다. 양쪽에서
// 네트워크 요청이 0 이다.
//
// 재현 빌드 원칙: 같은 PNG 집합 → 바이트 동일 출력(파일명 정렬 고정).
//
// 사용: node tools/build_icon_pack.js

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'icon-pack', 'colored-64');
const OUT = path.join(ROOT, 'archive','legacy_program', 'ord_icons.js');

if (!fs.existsSync(SRC)) throw new Error(`아이콘 원본이 없습니다: ${SRC}`);

const names = fs.readdirSync(SRC).filter((name) => name.endsWith('.png')).sort();
if (!names.length) throw new Error(`PNG 가 없습니다: ${SRC}`);

const icons = {};
let rawBytes = 0;
for (const file of names) {
  const buf = fs.readFileSync(path.join(SRC, file));
  rawBytes += buf.length;
  icons[file.replace(/\.png$/, '')] = `data:image/png;base64,${buf.toString('base64')}`;
}

const body = `// 생성물 — 직접 고치지 말고 tools/build_icon_pack.js 를 다시 실행하세요.
// 출처: assets/icon-pack (ORD Nightmare Coach Icon Pack v1.0.0, 투명 PNG 64px).
// 특정 게임 캐릭터 원화를 쓰지 않은 추상형 아이콘입니다.
window.ORD_ICONS=${JSON.stringify(icons)};
`;
fs.writeFileSync(OUT, body);
console.log(`ord_icons.js 생성: ${names.length}종, 원본 ${(rawBytes / 1024).toFixed(0)}KB → ${(body.length / 1024).toFixed(0)}KB`);
