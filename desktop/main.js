'use strict';
// v26.3.0 — ORD 악몽 코치 데스크톱 셸 (Electron 메인 프로세스).
//
// 확장(크롬) 없이 코치를 독립 프로그램으로 돌린다.  브라우저 제약
// (타이머 조임·MV3 정책·CORS)이 사라지므로 보험 장치 없이 단순하다:
//  · 메인 프로세스가 TMO 데스크톱의 /datas 를 1초마다 읽어 렌더러로
//    민다(렌더러는 fetch 를 하지 않는다 — 네트워크는 이 파일 한 곳).
//  · F5 = 인게임 HUD — 투명·클릭 통과 창에 코치 칩·카드만 게임 위에
//    뜬다(입력은 전부 게임으로).  F6 = 미니 패널(조작·HUD 위치 잡기).
//  · ordlog 자동 저장 — 렌더러가 요청하면 문서 폴더에 기록한다.
//
// 보안 계약(테스트 고정):
//  · 네트워크는 127.0.0.1:25625 하드코딩 — 다른 주소로 나가지 않는다.
//  · loadFile 만 사용(원격 콘텐츠 로드 없음).
//  · contextIsolation:true / nodeIntegration:false — 렌더러는 preload 가
//    노출한 API 외에 아무것도 못 만진다.
//  · 저장 파일명은 [\w.-]+ 만 허용하고 .ordlog.json 으로 강제한다.
const {app, BrowserWindow, ipcMain, globalShortcut, screen} = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DATAS_HOST = '127.0.0.1';
const DATAS_PORT = 25625;
const POLL_MS = 1000;

let win = null;
let hudWin = null;
let hudOn = false;
let pollTimer = null;
let overlayOn = false;
let savedBounds = null;

function fetchDatas() {
  return new Promise(resolve => {
    const request = http.get({host: DATAS_HOST, port: DATAS_PORT, path: '/datas', timeout: 3000}, response => {
      let body = '';
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 400000) request.destroy();
      });
      response.on('end', () => {
        try { resolve({ok: true, status: response.statusCode, payload: JSON.parse(body)}); }
        catch (_) { resolve({ok: false, error: 'json-parse'}); }
      });
    });
    request.on('timeout', () => { request.destroy(); resolve({ok: false, error: 'timeout'}); });
    request.on('error', error => resolve({ok: false, error: String(error && error.message || error)}));
  });
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    const result = await fetchDatas();
    if (win && !win.isDestroyed() && result.ok && result.payload) {
      win.webContents.send('ord-local-datas', result.payload);
    }
  }, POLL_MS);
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

// v19.14.1(실사용 낙제 교정): 전체 창 항상-위는 게임을 가리고 클릭까지
// 먹었다.  오버레이 = 우상단 미니 패널 — 코치가 작은 창으로 줄어 항상
// 위에 뜨고, 나머지 화면은 게임이 그대로 보이고 클릭된다.  렌더러는
// ord-overlay-mode 이벤트를 받아 컴팩트 표시(지금 할 일·결손만)로 바뀐다.
// v19.14.2("너무 불편한데"): 오버레이 위치·크기는 사용자가 정한다 —
// 패널 상태에서 창을 끌거나 크기를 바꾸면 그대로 기억했다가 다음
// 오버레이 때 재사용한다(세션 넘어도 유지).  기본값도 더 작게.
const OVERLAY_BOUNDS_FILE = () => path.join(app.getPath('userData'), 'ord-overlay-bounds.json');
function loadOverlayBounds() {
  try {
    const bounds = JSON.parse(fs.readFileSync(OVERLAY_BOUNDS_FILE(), 'utf8'));
    if (bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.width) && bounds.width >= 280 && bounds.height >= 200) return bounds;
  } catch (_) {}
  return null;
}
function saveOverlayBounds() {
  if (!overlayOn || !win || win.isDestroyed()) return;
  try { fs.writeFileSync(OVERLAY_BOUNDS_FILE(), JSON.stringify(win.getBounds())); } catch (_) {}
}
function toggleOverlay() {
  if (!win || win.isDestroyed()) return overlayOn;
  overlayOn = !overlayOn;
  if (overlayOn) {
    savedBounds = win.getBounds();
    const remembered = loadOverlayBounds();
    if (remembered) {
      win.setBounds(remembered);
    } else {
      const area = screen.getDisplayMatching(savedBounds).workArea;
      const width = 400;
      const height = Math.min(620, area.height - 24);
      win.setBounds({x: area.x + area.width - width - 12, y: area.y + 12, width, height});
    }
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setOpacity(0.97);
  } else {
    saveOverlayBounds();
    win.setAlwaysOnTop(false);
    win.setOpacity(1);
    if (savedBounds) win.setBounds(savedBounds);
  }
  try { win.webContents.send('ord-overlay-mode', overlayOn); } catch (_) {}
  return overlayOn;
}

// v22.10(사용자: "f8 f9 누르면 나오는 화면을 어떤 모니터에 띄울지 알려줬으면
// 해"): F10 = HUD·미니 패널을 다음 모니터로 보낸다.  F6 패널을 끌어 놓는
// 방법도 여전히 유효하지만, 멀티 모니터에선 단축키 한 번이 빠르다.  옮긴
// 자리는 기존 bounds 파일에 저장되므로 F5 HUD 도 같은 자리를 쓰고 재실행
// 에도 유지된다.  창이 하나도 안 떠 있으면 다음에 열릴 자리만 바꾼다.
function currentOverlayBounds() {
  if (overlayOn && win && !win.isDestroyed()) return win.getBounds();
  if (hudOn && hudWin && !hudWin.isDestroyed()) return hudWin.getBounds();
  return loadOverlayBounds();
}
function moveOverlayToNextDisplay() {
  const displays = screen.getAllDisplays();
  if (!displays.length) return;
  const bounds = currentOverlayBounds() || {x: 0, y: 0, width: 400, height: 560};
  const current = screen.getDisplayMatching(bounds);
  const index = Math.max(0, displays.findIndex(d => d.id === current.id));
  const area = displays[(index + 1) % displays.length].workArea;
  const width = Math.min(bounds.width || 400, area.width - 24);
  const height = Math.min(bounds.height || 560, area.height - 24);
  const target = {x: area.x + area.width - width - 12, y: area.y + 12, width, height};
  try { fs.writeFileSync(OVERLAY_BOUNDS_FILE(), JSON.stringify(target)); } catch (_) {}
  if (overlayOn && win && !win.isDestroyed()) win.setBounds(target);
  if (hudOn && hudWin && !hudWin.isDestroyed()) hudWin.setBounds(target);
}

// v19.15.0("게임 내에서 녹아들 수 없나"): 인게임 HUD — 창테두리 없는
// 완전 투명 창에 코치 칩·카드만 그린다.  클릭은 전부 게임으로 통과
// (setIgnoreMouseEvents)하고 포커스도 못 가져가(focusable:false) 게임
// 입력을 전혀 뺏지 않는다.  위치·크기는 미니 패널(F6)에서 잡은 자리를
// 그대로 쓴다 — HUD 자신은 클릭 통과라 끌 수 없기 때문.
function resolveUiFile(name) {
  const bundled = path.join(__dirname, 'ui', name);
  return fs.existsSync(bundled) ? bundled : path.join(__dirname, '..', 'ord_tmo_auto_extension_v15_0_0_rebuild', name);
}
function ensureHudWindow() {
  if (hudWin && !hudWin.isDestroyed()) return hudWin;
  const remembered = loadOverlayBounds();
  const area = screen.getDisplayMatching(win && !win.isDestroyed() ? win.getBounds() : {x: 0, y: 0, width: 800, height: 600}).workArea;
  // v23.7(사용자: "화면을 너무 가린다"): 기본 자리가 우상단 최상부라 게임
  // 자체 우상단 정보(시즌 패널·유닛 카운트 체인·점수표)를 정통으로 덮었다.
  // 기본은 그 아래(y+210)·조금 좁게(348) 잡는다.  F6 패널을 끌어 놓은
  // 자리(remembered)가 있으면 언제나 그 자리가 우선.
  const bounds = remembered || {x: area.x + area.width - 360, y: area.y + 210, width: 348, height: Math.min(560, area.height - 234)};
  hudWin = new BrowserWindow({
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  hudWin.setAlwaysOnTop(true, 'screen-saver');
  // v23.9(사용자: "클릭은 되는데 가려서 안 보이니까 힘들어"): forward 모드 —
  // 클릭은 통과시키되 마우스 이동은 렌더러가 계속 받아, 승인 버튼 위에
  // 커서가 있는 동안만 클릭을 켠다(ord-hud-interactive).
  hudWin.setIgnoreMouseEvents(true, {forward: true});
  hudWin.loadFile(resolveUiFile('ord_hud_desktop.html'));
  hudWin.on('closed', () => { hudWin = null; hudOn = false; });
  return hudWin;
}
// HUD 켬 상태도 기억한다 — 켠 채로 코치를 껐다 켜면 자동 복원.
const HUD_STATE_FILE = () => path.join(app.getPath('userData'), 'ord-hud-state.json');
function saveHudState() {
  try { fs.writeFileSync(HUD_STATE_FILE(), JSON.stringify({on: hudOn})); } catch (_) {}
}
function toggleHud() {
  const target = ensureHudWindow();
  hudOn = !hudOn;
  if (hudOn) {
    const remembered = loadOverlayBounds();
    if (remembered) target.setBounds(remembered);
    target.showInactive();
  } else {
    target.hide();
  }
  saveHudState();
  return hudOn;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#080d18',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.removeMenu();
  // 배포본은 자산이 앱 안(ui/)에 실려 있고, 개발 실행은 저장소 원본을 읽는다.
  const bundledPage = path.join(__dirname, 'ui', 'ord_helper_desktop.html');
  const repoPage = path.join(__dirname, '..', 'ord_tmo_auto_extension_v15_0_0_rebuild', 'ord_helper_desktop.html');
  win.loadFile(fs.existsSync(bundledPage) ? bundledPage : repoPage);
  win.on('closed', () => { win = null; });
}

ipcMain.handle('ord-local-probe', async () => fetchDatas());
ipcMain.handle('ord-overlay-toggle', () => toggleOverlay());
// 메인 창이 그린 HUD 조각을 HUD 창으로 중계한다.
ipcMain.on('ord-hud-state', (_event, payload) => {
  if (hudOn && hudWin && !hudWin.isDestroyed()) {
    try { hudWin.webContents.send('ord-hud-state', payload); } catch (_) {}
  }
});
// v23.9: HUD 렌더러가 승인 버튼 호버를 감지한 동안만 클릭을 받는다.
// HUD에서 누른 버튼은 메인 창의 같은 버튼으로 중계된다(앱 이중 구동 금지).
ipcMain.on('ord-hud-interactive', (_event, on) => {
  if (hudWin && !hudWin.isDestroyed()) {
    try { hudWin.setIgnoreMouseEvents(on !== true, {forward: true}); } catch (_) {}
  }
});
ipcMain.on('ord-hud-click', (_event, payload) => {
  if (win && !win.isDestroyed()) {
    try { win.webContents.send('ord-hud-click', payload && typeof payload === 'object' ? payload : {}); } catch (_) {}
  }
});
ipcMain.handle('ord-save-runlog', async (event, name, text) => {
  const safe = String(name || '').replace(/[^\w.-]/g, '');
  if (!safe || typeof text !== 'string' || text.length > 20000000) return {ok: false, error: 'invalid'};
  const fileName = safe.endsWith('.ordlog.json') ? safe : `${safe}.ordlog.json`;
  const dir = path.join(app.getPath('documents'), 'ORD_coach_logs');
  try {
    fs.mkdirSync(dir, {recursive: true});
    const file = path.join(dir, fileName);
    fs.writeFileSync(file + '.tmp', text);
    fs.renameSync(file + '.tmp', file);
    return {ok: true, file};
  } catch (error) { return {ok: false, error: String(error && error.message || error)}; }
});

app.whenReady().then(() => {
  createWindow();
  startPolling();
  // F5 = 인게임 HUD(투명·클릭 통과 — 게임에 녹아듦), F6 = 미니 패널
  // (조작·위치 잡기용).  HUD 위치를 옮기려면 F6 패널을 끌어 놓으면 된다.
  globalShortcut.register('F5', toggleHud);
  globalShortcut.register('F6', toggleOverlay);
  // F10 = HUD·미니 패널을 다음 모니터로 (자리 기억 공유).
  globalShortcut.register('F10', moveOverlayToNextDisplay);
  // 지난 실행에서 HUD 를 켠 채였다면 자동 복원.
  try {
    const saved = JSON.parse(fs.readFileSync(HUD_STATE_FILE(), 'utf8'));
    if (saved && saved.on === true) toggleHud();
  } catch (_) {}
});
app.on('will-quit', () => { saveOverlayBounds(); stopPolling(); globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => app.quit());
