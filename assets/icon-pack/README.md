# ORD 악몽 코치 아이콘 팩

웹 목업에 사용한 분위기를 기준으로 만든 추상형 아이콘 32개입니다.
모든 PNG는 투명 배경이며, 특정 게임 캐릭터 원화를 사용하지 않았습니다.

## 폴더

- `icons/colored/64`: 웹 UI용 64×64 컬러 PNG
- `icons/colored/256`: 고해상도 256×256 컬러 PNG
- `icons/white/64`: CSS 필터·단색 UI용 흰색 PNG
- `icons/white/256`: 고해상도 흰색 PNG
- `source`: 투명 아이콘 원본 시트
- `preview.png`: 전체 아이콘 미리보기
- `demo.html`: 브라우저에서 열어보는 예시
- `icons.css`: 64px 컬러 아이콘 CSS 클래스
- `manifest.json`: 파일 경로·설명·색상 정보

## HTML 사용 예

```html
<img
  src="./icons/colored/64/unit-maxim.png"
  width="32"
  height="32"
  alt=""
>
```

## CSS 클래스 사용 예

```html
<link rel="stylesheet" href="./icons.css">
<span class="ord-icon ord-icon--unit-maxim" aria-hidden="true"></span>
```

## 아이콘 목록

| 파일명 | 설명 | 분류 |
|---|---|---|
| `ui-round-clock` | 라운드 시계 | 상태 |
| `ui-phase-shield` | 국면·확정 방패 | 상태 |
| `ui-damage-swords` | 물딜·마딜 계통 | 상태 |
| `ui-wisp-spiral` | 선택위습 | 상태 |
| `ui-sync-check` | TMO 동기화 완료 | 상태 |
| `spec-stun` | 범위 스턴 | 스펙 |
| `spec-slow` | 이동속도 감소 | 스펙 |
| `spec-boss` | 보스·광폭화 | 스펙 |
| `spec-single` | 단일 딜 | 스펙 |
| `spec-end-damage` | 끝딜 | 스펙 |
| `spec-magic-defense-break` | 마법 방어력 감소 | 스펙 |
| `ui-check-circle` | 완료 | 컨트롤 |
| `ui-warning` | 경고 | 컨트롤 |
| `ui-reroll` | 희귀 리롤 | 컨트롤 |
| `ui-branch` | 조건부 분기 | 컨트롤 |
| `ui-chevron-right` | 상세 보기 | 컨트롤 |
| `unit-maxim` | 방주맥심 | 유닛 |
| `unit-aokiji` | 아오키지 | 유닛 |
| `unit-nekomamushi` | 네코마무시 | 유닛 |
| `unit-shiryu` | 시류 | 유닛 |
| `unit-bigmom` | 빅맘 | 유닛 |
| `unit-s-snake` | S-스네이크 | 유닛 |
| `rare-vanderdecken` | 반 더 데켄 | 희귀 |
| `rare-koby` | 코비 | 희귀 |
| `ui-unit-placeholder` | 유닛 기본 이미지 | 공통 |
| `ui-party-group` | 최종 파티 | 공통 |
| `ui-rare-gem` | 희귀함 | 공통 |
| `ui-material-cube` | 재료 | 공통 |
| `ui-recipe-book` | 조합식 | 공통 |
| `ui-protected-material` | 보존 재료 | 공통 |
| `ui-deadline-stopwatch` | 라운드 마감 | 공통 |
| `ui-settings-gear` | 설정 | 공통 |
