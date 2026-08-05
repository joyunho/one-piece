'use strict';
// v19.15.1 — 데스크톱 셸 preload.  렌더러에는 이 화이트리스트 API 만 보인다.
const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('ORD_DESKTOP', {
  version: '19.15.1',
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
  probe() { return ipcRenderer.invoke('ord-local-probe'); },
  toggleOverlay() { return ipcRenderer.invoke('ord-overlay-toggle'); },
  saveRunLog(name, text) { return ipcRenderer.invoke('ord-save-runlog', String(name || ''), String(text || '')); }
});
