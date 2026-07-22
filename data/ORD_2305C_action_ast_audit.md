# ORD 2.305C 전체 상위 JASS 액션 AST 정규화 감사 보고서

## 결과

- 기반 통합 프로필 SHA-256: `6ca824b2d3cbd3077ed0afd860672dead187e9d8099cb8efb8754292e7f9f5af`
- 전투 프로필: **63개**
- JASS 전체 함수 파싱: **3217개**
- 프로필 실행 도달 함수: **936개**
- 공격 시작 진입점(`sc`): **107개**
- 스펠 효과 진입점(`xc`): **91개**
  - 리터럴 rawcode 89개 + 전역 상수 해석 2개
- 초기화 진입점: **63개**
- 정규화 액션: **9568개**
- 피해 액션: **633개**
- 정적 확률 게이트: **258개**
- 소환/더미 유닛 객체: **692 rawcode**
- 연결된 능력 객체: **397 rawcode**

`numericMentions`는 그대로 보존했지만 계산 권위에서 제외했습니다. 피해량·확률·범위·상태식은 `actionAst.functions`의 제어 흐름과 `actionAst.actions`의 JASS 식만 사용해야 합니다.

## 실행 모델

- `sc(rawcode, handler)`는 명중이 아니라 `EVENT_PLAYER_UNIT_ATTACKED`, 즉 공격 시작입니다.
- `zL(a,b)`는 양 끝을 포함하는 균등 정수, `zM(a,b)`는 균등 실수입니다.
- `BWE`와 `BWF`는 내부 `zM(low,high) × base`를 피해량 AST로 펼쳤습니다.
- `TriggerExecute`는 `TriggerAddAction` 등록표를 따라 정적 콜백으로 연결했습니다.
- `BcF`/`BcK`/`ForGroup` 콜백과 `TimerStart`, `BDw`/`BDx`/`BDz` 지연 상태 전이를 보존했습니다.
- 전역 배열·해시테이블·유닛 자원 쓰기는 상태 액션으로 분리했습니다.

전체 프로그램 AST를 실행할 때는 기존 툴팁 `triggers[].probability`를 다시 곱하면 안 됩니다. 확률 분기는 이미 JASS `if` 조건에 들어 있습니다.

## 기존 파일에서 빠졌던 스펠 루트

- transcend.hawkins: 2개 — A0PE→BuU, A0PF→BuV
- transcend.usopp: 6개 — A0OT→Bp9, A12S→BqB, A12N→BqC, A12R→BqC, A12O→BqC, A12Q→BqC
- transcend.zoro: 2개 — AI03→Bpj, A0Q8→BpZ
- transcend.vegapunk: 3개 — A14Q→BwQ, A14U→BwQ, A14R→BwQ
- transcend.shanks: 2개 — A201→Brm, A0S2→Bri
- transcend.kizaru: 2개 — A0DX→Bsj, A0FO→Bst
- transcend.franky: 2개 — A0G7→BrK, A12D→Bq4
- eternal.vivi: 2개 — A0LF→Bxl, A12M→BxW

## 액션 분류

| 액션 종류 | 개수 |
|---|---:|
| `ability_mutation` | 177 |
| `actor_combat_stat_set` | 18 |
| `actor_kill` | 22 |
| `actor_pause_set` | 75 |
| `actor_property_set` | 311 |
| `actor_remove` | 11 |
| `actor_spatial_set` | 487 |
| `actor_spawn` | 1414 |
| `actor_timed_life` | 397 |
| `await_unit_event` | 41 |
| `buff_mutation` | 8 |
| `cancel_unit_event_wait` | 51 |
| `damage` | 633 |
| `for_each_unit` | 160 |
| `forced_movement` | 61 |
| `fsm_slot_write` | 3304 |
| `fsm_start_or_set_state` | 223 |
| `fsm_terminate` | 280 |
| `hashtable_write` | 3 |
| `player_resource_add` | 2 |
| `player_resource_set` | 55 |
| `restore_attack_order` | 44 |
| `schedule_fsm_step` | 635 |
| `schedule_timer` | 1 |
| `state_write` | 387 |
| `status_stack_add` | 23 |
| `trigger_dispatch` | 257 |
| `unit_order` | 329 |
| `unit_resource_add` | 6 |
| `unit_resource_set` | 153 |

## 무결성 검증

- `duplicateWebCardIds`: `[]`
- `duplicateProfileIds`: `[]`
- `duplicateEntityRawcodes`: `[]`
- `uncoveredAuthoritativeUpperRawcodes`: `[]`
- `unexpectedLinkedUpperRawcodes`: `[]`
- `missingJassHandlers`: `[]`
- `profilesAllowingKillVerdict`: `[]`
- `functionParseFailures`: `[]`
- `expressionFallbacks`: `[]`
- `semanticActionExpressionFallbacks`: `[]`
- `missingEntryFunctions`: `[]`
- `attackEntryPointCountMismatch`: `False`
- `spellEntryPointCountMismatch`: `False`
- `auxiliarySetupEntryPointCountMismatch`: `False`
- `duplicateAttackRegistrations`: `[]`
- `duplicateSpellRegistrations`: `[]`
- `damageActionsMissingAmountAst`: `[]`
- `duplicateActionIds`: `[]`
- `damagePrimitiveCountMismatch`: `False`
- `unexpectedUnresolvedTriggerDispatch`: `[]`
- `tooltipNumericMentionsUsedAsAuthority`: `0`
- `profilesNotActionAstReady`: `[]`

## 남은 런타임 경계

액션 AST는 도달 가능한 스킬 JASS 제어 흐름을 손실 없이 보존하며 피해식은 확정값입니다. 다만 자동 DPS에 넣을지 여부는 수동 스킬 사용 정책, 보스/라인 대상 수, 소환체 타게팅, 더미 주문의 시전자→능력→주문 경로 해석이 필요합니다. 따라서 `allowSkillDpsDerivation=true`이지만 `allowKillVerdict=false`로 유지했습니다.
