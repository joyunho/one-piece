ORD 악몽 코치 — 아카이브 (v29.0.0 정리)
========================================

이 폴더는 v28 전면 신작 이전의 옛 프로그램을 동결 보관한다.
런타임(ord_board/ + desktop/)은 여기 파일을 한 줄도 싣지 않는다.

legacy_program/
  옛 확장 프로그램 전체 (ord_tmo_auto_extension_v15_0_0_rebuild 시절).
  두 가지 용도로만 살아 있다:
  1) 지식 원천 — tools/build_ord_board_data.js 증류기가 빌드 타임에
     여기 모듈(2.314 정본 카탈로그·패치 레이어·역할 교정표·클리어
     실측·코드맵)을 vm 오라클로 읽어 ord_board/data.js 로 굳힌다.
     npm run build 가 ord_clear_stats.js / ord_meta_stats.js 를 여기에
     재생성하는 것도 그 때문이다(데이터는 갱신, 코드는 동결).
  2) 솔버 오라클 — tests/ord_board_solver_test.js 가 구 recipeSolve 와
     신작 core.solve 의 447/447 파리티를 계약한다.

legacy_tests/
  옛 프로그램의 테스트 175벌 + lib/ + UI 픽스처.
  v28.1.0(커밋 6ee5961)에서 전부 초록으로 동결됐다.
  다시 돌리려면 경로 조정이 필요하다(테스트가 리포 루트 기준의 옛
  폴더명을 참조하던 시절 작성물이라, 이동한 archive/legacy_program·
  archive/legacy_tests 기준으로 상대 경로를 손봐야 한다).

ord_2310_nightmare_helper_v28_1_0_manual.html
  단일 HTML 수동판 최종본(빌드 산출물). 참고용 스냅샷.

분석기록/
  옛 프로그램 시절의 판단 디버깅 일지(실패로그·실전로그 분석,
  v23 마이그레이션 보고, 클리어 실측 분석, 진행기록 사용법,
  판단 검증 범위). 결론은 이미 코드·데이터에 반영돼 있다.

스토리_등급표_v28_1_0.md / 검증결과_구프로그램_v16-v17.txt /
README_구프로그램_문서_v28_1_0.txt
  옛 프로그램의 산출 문서·검증 기록·루트 README 스냅샷.

살아 있는 계약은 tests/ 의 신작 스위트가 전부 대신한다:
  node tests/run_all.js  (ORD_REQUIRE_ALL=1 이면 SKIP 도 실패)
