const { contextBridge, ipcRenderer } = require('electron');

const params = new URLSearchParams(window.location.search);
const windowName = params.get('window') ?? 'main';

// HUD-окно: пилюля снаружи приложения. Только свой узкий набор каналов.
if (windowName === 'hud') {
  contextBridge.exposeInMainWorld('delkol', {
    isElectron: true,
    windowName,
    platform: process.platform,
    onHudState: (callback) => {
      const wrapped = (_event, payload) => callback(payload);
      ipcRenderer.on('hud:state', wrapped);
      return () => ipcRenderer.removeListener('hud:state', wrapped);
    },
    openSettings: () => ipcRenderer.send('hud:openSettings'),
  });
} else {

contextBridge.exposeInMainWorld('delkol', {
  isElectron: true,
  windowName,
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:maximizeToggle'),
  close: () => ipcRenderer.invoke('window:close'),
  getState: () => ipcRenderer.invoke('window:getState'),
  onWindowState: (callback) => {
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on('window:state', wrapped);
    return () => ipcRenderer.removeListener('window:state', wrapped);
  },
  // Phase switching between the three windows.
  loadingDone: () => ipcRenderer.send('loading:done'),
  authSuccess: (email) => ipcRenderer.invoke('auth:success', { email }),
  // Auth window asks the main process to reveal it only when the login form is actually needed.
  authShow: () => ipcRenderer.send('auth:show'),
  signOut: () => ipcRenderer.send('session:signout'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  // OS notification popups (see electron/notifications.cjs).
  notify: (text, type, title) => ipcRenderer.invoke('notify:show', text, type, title),
  // System optimizer (Настройки → Оптимизация). Read-only except the two clean actions.
  systemInfo: () => ipcRenderer.invoke('system:info'),
  systemBigItems: () => ipcRenderer.invoke('system:bigItems'),
  systemTempClean: () => ipcRenderer.invoke('system:tempClean'),
  systemGameClean: () => ipcRenderer.invoke('system:gameClean'),
  // Progress streaming for the optimizer bars (0..100 percent + detail).
  onTempCleanProgress: (callback) => {
    const wrapped = (_event, percent, detail) => callback(percent, detail);
    ipcRenderer.on('system:tempClean:progress', wrapped);
    return () => ipcRenderer.removeListener('system:tempClean:progress', wrapped);
  },
  onBigItemsProgress: (callback) => {
    const wrapped = (_event, percent, detail) => callback(percent, detail);
    ipcRenderer.on('system:bigItems:progress', wrapped);
    return () => ipcRenderer.removeListener('system:bigItems:progress', wrapped);
  },
  notifyPayload: (id) => ipcRenderer.invoke('notify:get', id),
  notifyHover: (id, hovering) => ipcRenderer.send('notify:hover', id, hovering),
  notifyClose: (id) => ipcRenderer.send('notify:close', id),
  notifyFocusApp: (id) => ipcRenderer.send('notify:focus-app', id),
  platform: process.platform,
  needsCssRounding: process.platform === 'win32' && Number(process.getSystemVersion().split('.')[2] ?? 0) < 22000,
  glassFrame: (() => {
    // Glass rim frame needs a transparent window; the main process decides.
    // (Kept in sync with useGlassFrame() in electron/main.cjs.)
    if (process.platform === 'linux') return false;
    return true;
  })(),
  // HUD: управление внешней пилюлей (из главного окна).
  hudSetEnabled: (enabled) => ipcRenderer.invoke('hud:setEnabled', enabled),
  hudGetEnabled: () => ipcRenderer.invoke('hud:getEnabled'),
  hudPushState: (payload) => ipcRenderer.send('hud:state', payload),
  onHudOpenSettings: (callback) => {
    const wrapped = () => callback();
    ipcRenderer.on('hud:openSettings', wrapped);
    return () => ipcRenderer.removeListener('hud:openSettings', wrapped);
  },
});
}
