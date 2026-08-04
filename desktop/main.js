'use strict';
// v19.12.0 — ORD 악몽 코치 데스크톱 셸 (Electron 메인 프로세스).
//
// 확장(크롬) 없이 코치를 독립 프로그램으로 돌린다.  브라우저 제약
// (타이머 조임·MV3 정책·CORS)이 사라지므로 보험 장치 없이 단순하다:
//  · 메인 프로세스가 TMO 데스크톱의 /datas 를 1초마다 읽어 렌더러로
//    민다(렌더러는 fetch 를 하지 않는다 — 네트워크는 이 파일 한 곳).
//  · F8 = 오버레이 토글(항상 위 + 반투명) — 게임 위에 코치를 띄운다.
//  · ordlog 자동 저장 — 렌더러가 요청하면 문서 폴더에 기록한다.
//
// 보안 계약(테스트 고정):
//  · 네트워크는 127.0.0.1:25625 하드코딩 — 다른 주소로 나가지 않는다.
//  · loadFile 만 사용(원격 콘텐츠 로드 없음).
//  · contextIsolation:true / nodeIntegration:false — 렌더러는 preload 가
//    노출한 API 외에 아무것도 못 만진다.
//  · 저장 파일명은 [\w.-]+ 만 허용하고 .ordlog.json 으로 강제한다.
const {app, BrowserWindow, ipcMain, globalShortcut} = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DATAS_HOST = '127.0.0.1';
const DATAS_PORT = 25625;
const POLL_MS = 1000;

let win = null;
let pollTimer = null;
let overlayOn = false;

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

function toggleOverlay() {
  if (!win || win.isDestroyed()) return overlayOn;
  overlayOn = !overlayOn;
  win.setAlwaysOnTop(overlayOn, 'screen-saver');
  win.setOpacity(overlayOn ? 0.94 : 1);
  return overlayOn;
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
  globalShortcut.register('F8', toggleOverlay);
});
app.on('will-quit', () => { stopPolling(); globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => app.quit());
