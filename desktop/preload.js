'use strict';
// v27.0.0 — 데스크톱 셸 preload.  렌더러에는 이 화이트리스트 API 만 보인다.
const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('ORD_DESKTOP', {
  version: '27.0.0',
  onDatas(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('ord-local-datas', (_event, payload) => {
      try { callback(payload); } catch (_) {}
    });
  },
  onOverlayMode(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('ord-overlay-mode', (_event, on) => {
      try { callback(on === true); } catch (_) {}
    });
  },
  sendHudState(payload) {
    try { ipcRenderer.send('ord-hud-state', payload && typeof payload === 'object' ? payload : {}); } catch (_) {}
  },
  onHudState(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('ord-hud-state', (_event, payload) => {
      try { callback(payload); } catch (_) {}
    });
  },
  // v23.9: HUD 호버-클릭 — 승인 버튼 위에서만 클릭을 받고, 클릭은 메인
  // 창의 같은 버튼으로 중계된다.
  setHudInteractive(on) {
    try { ipcRenderer.send('ord-hud-interactive', on === true); } catch (_) {}
  },
  sendHudClick(payload) {
    try { ipcRenderer.send('ord-hud-click', payload && typeof payload === 'object' ? payload : {}); } catch (_) {}
  },
  onHudClick(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('ord-hud-click', (_event, payload) => {
      try { callback(payload); } catch (_) {}
    });
  },
  probe() { return ipcRenderer.invoke('ord-local-probe'); },
  toggleOverlay() { return ipcRenderer.invoke('ord-overlay-toggle'); },
  saveRunLog(name, text) { return ipcRenderer.invoke('ord-save-runlog', String(name || ''), String(text || '')); }
});
