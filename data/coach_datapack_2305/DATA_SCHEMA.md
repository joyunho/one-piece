# 원랜디 2.305 실전 데이터 스키마

## 목적

이 패키지는 스킬 백과사전을 그대로 추천 점수로 쓰지 않는다. 검증된 사실, 공개 클리어 관찰, 사용자 고정 규칙, 스킬 구조에서 도출한 판단을 분리해 코치 엔진이 근거와 불확실성을 함께 표시하도록 한다.

## 증거 등급

| 값 | 의미 | 추천 엔진 사용 |
|---|---|---|
| `verified` | ORDSearch 관리자 팁·개별 본문·패치 기록에서 직접 확인 | 핵심 판정에 사용 |
| `observed` | 2.305 공개 클리어 기록에서 관찰 | 동반 사례·운용 예시로만 사용 |
| `user_rule` | 사용자가 프로그램에 고정한 규칙 | 워크플로와 필터에 사용 |
| `derived` | 스킬 구조에서 도출한 전략 판단 | 설명 가능한 가중치로 사용 |
| `unverified` | 공개 자료만으로 확정 불가 | 경고만 표시, 자동 점수 제외 |

같은 수치가 충돌하면 목표 버전에 적용되는 최신 누적 패치, 패치 이후 갱신된 ORDSearch 상세/관리자 팁, 공개 클리어 관찰 순으로 판정한다. 구버전 상세 페이지나 팁은 삭제하지 않고 `overrides_older_source` 또는 충돌 메모로 남긴다.

## 상위 키트

상위 70개 레코드는 동일한 최종 스킬셋을 묶어 63개 전투 키트로 관리한다.

```json
{
  "kit_id": "law_transcendent",
  "name": "트라팔가 로우",
  "grade": "초월함",
  "record_urls": ["https://ordsearch.net/characters/..."],
  "damage_branch": "magic",
  "provides": ["main_dps", "single_current_hp", "buff_remove", "single_slow"],
  "missing_core": ["area_slow", "area_stun", "line_finisher"],
  "effects": [],
  "recommended_second_uppers": [],
  "support_slots": {},
  "bad_pairs": [],
  "operation": {},
  "requirements": {},
  "evidence": [],
  "confidence": "high"
}
```

## 효과

효과는 이름만 세지 않고 범위와 적용 대상을 분리한다.

```json
{
  "effect_type": "slow",
  "value": 99,
  "unit": "percent",
  "scope": "single",
  "range": null,
  "target_class": ["normal_line", "boss", "berserk"],
  "trigger": "skill_hit",
  "proc_chance": null,
  "duration_seconds": null,
  "cooldown_seconds": null,
  "expected_uptime": null,
  "boss_applies": true,
  "stack_group": null,
  "max_stack": null,
  "reset_by": ["ain_rewind"],
  "source_url": "https://ordsearch.net/characters/...",
  "evidence": "verified",
  "confidence": "high"
}
```

모르는 수치를 `0`으로 넣지 않는다. `null`과 `unverified`를 사용한다.

## 공개 클리어 기록

```json
{
  "record_id": "source-derived-id",
  "version": "2.305",
  "difficulty": "악몽",
  "sample_scope": "standard_or_solo",
  "solo": true,
  "date": "2026-07-14",
  "unit_count": 0,
  "gorosei": "나스쥬로",
  "navigation": null,
  "upper_units": [],
  "support_units": [],
  "items": [],
  "micro_units": [],
  "control_notes": [],
  "source_url": "https://...",
  "evidence": "observed"
}
```

`sample_scope`는 최소한 `standard_or_solo`와 `mutated`를 분리한다. 원문에는 있으나 현행 유닛·등급으로 확정하지 못한 표기는 `unverified_raw_support_units`에 원문 그대로 보존하고 통계에서는 제외한다.

공개 성공 기록만 모은 데이터에서는 다음을 계산할 수 있다.

- 상위별 표본 수
- 보조 유닛 동반 횟수와 표본 내 비율
- 두 번째 상위 동반 사례
- 아이템·오로성·항법 관찰 분포
- 유닛카운트 중앙값과 범위

다음은 계산하지 않는다.

- 승률
- 절대 티어
- 해당 유닛 때문에 클리어했다는 인과관계
- 기록되지 않은 아이템·조작의 부재

## 재료 그래프

```json
{
  "target": "유닛명",
  "grade": "전설적인",
  "direct_requires": [],
  "base_material_totals": {},
  "selector_cost_from_inventory": null,
  "protected_for_final": false,
  "blocks_paths": [],
  "alternatives": [],
  "source_url": "https://ordsearch.net/characters/...",
  "evidence": "verified"
}
```

추천 시 단순 완성도뿐 아니라 만든 뒤 막히는 상위·보완 경로와 남는 희귀함을 함께 계산한다.

## 역할 코드

### 공통

- `area_stun`
- `single_stun`
- `area_slow`
- `single_slow`
- `boss_kill`
- `berserk_kill`
- `mana_regen`
- `attack_buff`
- `attack_speed_buff`
- `support_damage`

### 물딜

- `physical_main`
- `armor_reduction`
- `armor_break`
- `physical_boss`
- `physical_utility`

### 마딜

- `magic_main`
- `magic_single`
- `magic_finisher`
- `magic_boss`
- `magic_resistance_reduction`
- `magic_damage_amp`
- `explosive_damage_amp`
- `magic_utility`

## 추천 결과

추천 카드에는 점수만 표시하지 않고 근거를 함께 반환한다.

```json
{
  "candidate": "후보 유닛",
  "score": 0,
  "fills": [],
  "completion_percent": 0,
  "selector_cost": 0,
  "consumes_protected_rares": [],
  "blocks_paths": [],
  "requirements_missing": [],
  "observed_clear_examples": [],
  "warnings": [],
  "confidence": "medium"
}
```

추천 우선순위는 `부족 역할 보완 > 현재 완성도 > 직접 시너지 > 재료 보존 > 공개 클리어 관찰`이고, 선택위습·핵심 희귀 소모·중복·충돌·미보유 조건을 감점한다.
