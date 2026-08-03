# ORD 악몽 코치 — 데스크톱 셸 (v19.11.1 프로토타입)

크롬 확장 없이 코치를 독립 프로그램으로 돌립니다.  TMO.GG **데스크톱
앱**(로컬 서버)만 켜져 있으면 되고, tmo.gg 탭은 필요 없습니다.

## 실행 (Windows)

Node.js 18+ 가 설치돼 있어야 합니다.

```
cd desktop
npm install
npm start
```

## exe 만들기 (설치 없이 더블클릭 실행)

```
cd desktop
npm install
npm run dist:win
```

`dist/ORDCoach-win32-x64/` 폴더가 생깁니다 — 그 안의 **ORDCoach.exe**
를 더블클릭하면 끝입니다(폴더째 옮겨도 됩니다.  Node 도 필요 없습니다).
빌드 절차: `build_ui.js` 가 헬퍼 페이지의 참조를 파싱해 자산을 `ui/` 로
복사하고, `package_win.js` 가 @electron/packager 로 win32-x64 를 묶습니다
(리소스 편집이 순수 JS 라 리눅스/맥에서도 같은 명령으로 빌드됩니다).

## 확장판과의 차이

| | 확장(크롬) | 데스크톱 셸 |
|---|---|---|
| /datas 폴링 | 2.5초(보임)/15초(숨김) | **1초 · 항상** |
| 오버레이 | 불가 | **F8 — 항상 위 + 반투명** |
| ordlog 저장 | 수동 내보내기 | **60초 자동 저장** (`문서/ORD_coach_logs/`) |
| 완성도%·현재 능력치 | TMO 탭 보강 | 없음(화면에 '보강 대기'로 표시) |
| 타이머 조임·MV3 정책 | 보험 장치 필요 | 해당 없음 |

## 보안 계약

- 네트워크는 `127.0.0.1:25625` 하드코딩 한 곳뿐입니다(메인 프로세스).
- 원격 콘텐츠를 로드하지 않습니다(`loadFile` 만).
- 렌더러는 `contextIsolation` 아래에서 화이트리스트 API
  (`ORD_DESKTOP.onDatas/probe/toggleOverlay/saveRunLog`)만 봅니다.

## 알려진 한계 (프로토타입)

- 완성도%·현재 능력치는 TMO 도우미 화면이 계산하는 값이라 셸에는
  없습니다 — 수량·위습·자동 라운드·추천은 전부 정상입니다.
- exe 아이콘은 Electron 기본 아이콘입니다(전용 아이콘은 후속).
- 단일 파일 exe·자동 업데이트(electron-builder)는 후속 — 지금은
  폴더째 배포(zip)입니다.
