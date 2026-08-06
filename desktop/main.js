'use strict';
// v20.0.0 — ORD 악몽 코치 데스크톱 셸 (Electron 메인 프로세스).
//
// 확장(크롬) 없이 코치를 독립 프로그램으로 돌린다.  브라우저 제약
// (타이머 조임·MV3 정책·CORS)이 사라지므로 보험 장치 없이 단순하다:
//  · 메인 프로세스가 TMO 데스크톱의 /datas 를 1초마다 읽어 렌더러로
//    민다(렌더러는 fetch 를 하지 않는다 — 네트워크는 이 파일 한 곳).
//  · F8 = 인게임 HUD — 투명·클릭 통과 창에 코치 칩·카드만 게임 위에
//    뜬다(입력은 전부 게임으로).  F9 = 미니 패널(조작·HUD 위치 잡기).
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

// v19.15.0("게임 내에서 녹아들 수 없나"): 인게임 HUD — 창테두리 없는
// 완전 투명 창에 코치 칩·카드만 그린다.  클릭은 전부 게임으로 통과
// (setIgnoreMouseEvents)하고 포커스도 못 가져가(focusable:false) 게임
// 입력을 전혀 뺏지 않는다.  위치·크기는 미니 패널(F9)에서 잡은 자리를
// 그대로 쓴다 — HUD 자신은 클릭 통과라 끌 수 없기 때문.
function resolveUiFile(name) {
  const bundled = path.join(__dirname, 'ui', name);
  return fs.existsSync(bundled) ? bundled : path.join(__dirname, '..', 'ord_tmo_auto_extension_v15_0_0_rebuild', name);
}
function ensureHudWindow() {
  if (hudWin && !hudWin.isDestroyed()) return hudWin;
  const remembered = loadOverlayBounds();
  const area = screen.getDisplayMatching(win && !win.isDestroyed() ? win.getBounds() : {x: 0, y: 0, width: 800, height: 600}).workArea;
  const bounds = remembered || {x: area.x + area.width - 412, y: area.y + 12, width: 400, height: Math.min(560, area.height - 24)};
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
  hudWin.setIgnoreMouseEvents(true);
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
  // F8 = 인게임 HUD(투명·클릭 통과 — 게임에 녹아듦), F9 = 미니 패널
  // (조작·위치 잡기용).  HUD 위치를 옮기려면 F9 패널을 끌어 놓으면 된다.
  globalShortcut.register('F8', toggleHud);
  globalShortcut.register('F9', toggleOverlay);
  // 지난 실행에서 HUD 를 켠 채였다면 자동 복원.
  try {
    const saved = JSON.parse(fs.readFileSync(HUD_STATE_FILE(), 'utf8'));
    if (saved && saved.on === true) toggleHud();
  } catch (_) {}
});
app.on('will-quit', () => { saveOverlayBounds(); stopPolling(); globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => app.quit());
