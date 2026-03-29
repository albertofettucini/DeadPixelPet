const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  setInteractive: (v) => ipcRenderer.send('set-interactive', v),
  getScreenBounds: () => ipcRenderer.invoke('get-screen-bounds'),
  getTaskbarBounds: () => ipcRenderer.invoke('get-taskbar-bounds'),
  onSetPaused: (cb) => ipcRenderer.on('set-paused', (_, v) => cb(v)),
  onSetMuted: (cb) => ipcRenderer.on('set-muted', (_, v) => cb(v)),
  onOpenSettings: (cb) => ipcRenderer.on('open-settings', () => cb()),
  onOpenStats: (cb) => ipcRenderer.on('open-stats', () => cb()),
  onOpenCustomize: (cb) => ipcRenderer.on('open-customize', () => cb())
});
