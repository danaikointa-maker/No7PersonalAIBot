// Preload bridge — gives the shared web bundle a narrow, explicit native API.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('no7', {
  platform: 'desktop',
  native: {
    isDesktop: true,
    openExternal: (url) => ipcRenderer.invoke('no7:open-external', url),
    toggleOverlay: () => ipcRenderer.invoke('no7:toggle-overlay'),
    sendSubtitle: (text) => ipcRenderer.send('no7:subtitle', text),
    sendEmotion: (emotion) => ipcRenderer.send('no7:emotion', emotion),
    onPushToTalk: (cb) => ipcRenderer.on('no7:push-to-talk', () => cb()),
    onSubtitle: (cb) => ipcRenderer.on('no7:subtitle', (_e, text) => cb(text)),
    onEmotion: (cb) => ipcRenderer.on('no7:emotion', (_e, emotion) => cb(emotion)),
  },
});
