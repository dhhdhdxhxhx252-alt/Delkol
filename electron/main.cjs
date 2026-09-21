const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fsPromises = require('node:fs/promises');
const { showNotification, registerIpc: registerNotifyIpc } = require('./notifications.cjs');

const ROOT = path.join(__dirname, '..');
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

/**
 * Delkol — three real Electron windows:
 *   1) loading — splash with the bunny design
 *   2) auth    — login / registration
 *   3) main    — the workspace app (Supabase-backed)
 * All three load the same built index.html; the renderer picks its screen
 * from the `?window=` query param, and phases switch via IPC:
 *   loading -> auth : loading:done
 *   auth    -> main : auth:success (with account email)
 *   main -> auth    : session:signout
 */

let loadingWindow = null;
let authWindow = null;
let mainWindow = null;
let hudWindow = null;
let hudEnabled = false;
let quitRequested = false;

// ---------------------------------------------------------------------------
// HUD window: отдельная прозрачная пилюля у КРАЯ ЭКРАНА (рабочего стола),
// а не окна приложения (NotchNook-стиль). Всегда поверх, не крадёт фокус
// (focusable: false) — клики по шестерёнке уходят в приложение через IPC.
// Высота окна подстраивается под число активных макросов и растёт/сжимается
// с плавной анимацией в стиле macOS (easeOutCubic).
// ---------------------------------------------------------------------------
const HUD_WIDTH = 64;      // ширина самой пилюли
const HUD_ITEM_HEIGHT = 72; // кольцо 38 + зазор 4 + процент 9 + метка группы 2+8 + воздух
const HUD_ANIM_MS = 360;
const HUD_SCREEN_MARGIN = 8; // отступ пилюли от правого края экрана
// Прозрачный запас вокруг пилюли: сама пилюля уже, чем окно, чтобы мягкая
// тень не обрывалась краем окна (скриншот: тень резко срезалась).
const HUD_PAD_X = 26; // слева + справа запаса под тень
const HUD_PAD_TOP = 24;
const HUD_PAD_BOTTOM = 26;
const HUD_PILL_BASE_HEIGHT = 150; // паддинги пилюли + шестерёнка + пустое состояние

function hudWorkArea() {
  let area = screen.getPrimaryDisplay().workArea;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      area = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
    }
  } catch { /* display list unavailable */ }
  return area;
}

function hudHeightForCount(count) {
  const area = hudWorkArea();
  const max = Math.max(HUD_PILL_BASE_HEIGHT, area.height - 48);
  return Math.min(HUD_PILL_BASE_HEIGHT + Math.max(0, count) * HUD_ITEM_HEIGHT, max);
}

/** Окно больше пилюли на прозрачные поля (HUD_PAD_*): мягкая тень пилюли
 *  не должна обрезаться краем прозрачного окна. */
function hudBounds(pillHeight) {
  const area = hudWorkArea();
  const pill = Math.max(80, Math.round(pillHeight));
  const h = pill + HUD_PAD_TOP + HUD_PAD_BOTTOM;
  return {
    x: area.x + area.width - HUD_WIDTH - HUD_PAD_X - HUD_SCREEN_MARGIN,
    y: Math.round(area.y + area.height / 2 - h / 2),
    width: HUD_WIDTH + HUD_PAD_X * 2,
    height: h,
  };
}

function positionHudWindow(pillHeight) {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  try { hudWindow.setBounds(hudBounds(pillHeight ?? hudWindow.getBounds().height - HUD_PAD_TOP - HUD_PAD_BOTTOM)); } catch { /* destroyed mid-move */ }
}

let hudAnimTimer = null;
/** Плавно меняет высоту HUD-окна (macOS-подобный easeOutCubic). */
function animateHudHeight(pillTarget) {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  const start = hudWindow.getBounds().height - HUD_PAD_TOP - HUD_PAD_BOTTOM;
  const target = pillTarget + HUD_PAD_TOP + HUD_PAD_BOTTOM;
  if (Math.abs(start - target) < 2) return;
  if (hudAnimTimer) clearInterval(hudAnimTimer);
  const startedAt = Date.now();
  hudAnimTimer = setInterval(() => {
    if (!hudWindow || hudWindow.isDestroyed()) { clearInterval(hudAnimTimer); hudAnimTimer = null; return; }
    const progress = Math.min(1, (Date.now() - startedAt) / HUD_ANIM_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    positionHudWindow(start + (target - start) * eased - HUD_PAD_TOP - HUD_PAD_BOTTOM);
    if (progress >= 1) { clearInterval(hudAnimTimer); hudAnimTimer = null; }
  }, 16);
}

function destroyHudWindow() {
  if (hudWindow && !hudWindow.isDestroyed()) hudWindow.destroy();
  hudWindow = null;
}

function createHudWindow() {
  if (hudWindow && !hudWindow.isDestroyed()) { positionHudWindow(); hudWindow.showInactive(); return; }
  hudWindow = new BrowserWindow({
    ...hudBounds(HUD_PILL_BASE_HEIGHT),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    icon: path.join(ROOT, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  hudWindow.setAlwaysOnTop(true, 'screen-saver');
  if (DEV_URL) void hudWindow.loadURL(`${DEV_URL}/?window=hud`);
  else void hudWindow.loadFile(path.join(ROOT, 'dist-web', 'index.html'), { query: { window: 'hud' } });
  hudWindow.once('ready-to-show', () => {
    if (!hudWindow || hudWindow.isDestroyed()) return;
    positionHudWindow(HUD_PILL_BASE_HEIGHT);
    hudWindow.showInactive();
  });
  hudWindow.on('closed', () => { hudWindow = null; });
}

// ---------------------------------------------------------------------------
// System optimization (Настройки → Оптимизация): real disk/RAM/temp data.
// Everything is read-only except the two explicit cleanup actions.
// ---------------------------------------------------------------------------
const pathExists = async (target) => {
  try { await fsPromises.access(target); return true; } catch { return false; }
};

/** Recursive directory size with a depth cap and a hard timeout, so a huge
 *  folder can never freeze the optimizer page. Symlinks are skipped. */
async function dirSize(target, { maxDepth = 4, timeoutMs = 6000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let total = 0;
  const walk = async (dir, depth) => {
    if (depth > maxDepth || Date.now() > deadline) return;
    let entries;
    try { entries = await fsPromises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (entry.isFile()) {
        try { total += (await fsPromises.stat(full)).size; } catch { /* locked / gone */ }
      }
    }
  };
  await walk(target, 0);
  return total;
}

async function driveRoots() {
  if (process.platform !== 'win32') return ['/'];
  const roots = [];
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`;
    if (await pathExists(root)) roots.push(root);
  }
  return roots;
}

ipcMain.handle('system:info', async () => {
  const drives = [];
  for (const root of await driveRoots()) {
    try {
      const stats = await fsPromises.statfs(root);
      drives.push({ root, total: stats.blocks * stats.bsize, free: stats.bavail * stats.bsize });
    } catch { /* drive not ready (card reader etc.) */ }
  }
  const tempSize = await dirSize(os.tmpdir(), { maxDepth: 3, timeoutMs: 4000 }).catch(() => 0);
  // Aggregated CPU times let the renderer HUD compute a real load percentage
  // between two samples (idle vs total deltas).
  const cpuTimes = os.cpus().reduce(
    (acc, core) => ({
      idle: acc.idle + core.times.idle,
      total: acc.total + core.times.user + core.times.nice + core.times.sys + core.times.idle + core.times.irq,
    }),
    { idle: 0, total: 0 },
  );
  return {
    ok: true,
    drives,
    memory: { total: os.totalmem(), free: os.freemem() },
    cpu: { model: (os.cpus()[0] ?? {}).model ?? '', cores: os.cpus().length, speedMhz: (os.cpus()[0] ?? {}).speed ?? 0 },
    cpuTimes,
    platform: process.platform,
    uptime: Math.round(os.uptime()),
    tempSize,
  };
});

/** Clean the user temp folder. Files currently in use simply fail to delete
 *  and are skipped — Windows behaviour the user expects. Progress is streamed
 *  to the renderer (system:tempClean:progress) so the UI can show a % bar. */
ipcMain.handle('system:tempClean', async (event) => {
  const dir = os.tmpdir();
  const send = (percent, detail) => {
    if (!event.sender.isDestroyed()) event.sender.send('system:tempClean:progress', Math.max(0, Math.min(100, Math.round(percent))), detail);
  };
  send(0, 'Подготовка…');
  let freed = 0;
  let removed = 0;
  let entries = [];
  try { entries = await fsPromises.readdir(dir, { withFileTypes: true }); } catch { send(100, 'Папка недоступна'); return { freed: 0, removed: 0 }; }
  const targets = entries.filter((entry) => !entry.isSymbolicLink());
  for (let index = 0; index < targets.length; index += 1) {
    const entry = targets[index];
    send((index / Math.max(1, targets.length)) * 96, entry.name);
    const full = path.join(dir, entry.name);
    const size = entry.isDirectory()
      ? await dirSize(full, { maxDepth: 3, timeoutMs: 2000 }).catch(() => 0)
      : await fsPromises.stat(full).then((stats) => (stats.isFile() ? stats.size : 0)).catch(() => 0);
    try { await fsPromises.rm(full, { recursive: true, force: true }); freed += size; removed += 1; } catch { /* in use */ }
  }
  send(100, 'Готово');
  return { freed, removed };
});

/** Top-level largest folders across the usual install locations. Progress is
 *  streamed to the renderer (system:bigItems:progress) for the % bar. */
ipcMain.handle('system:bigItems', async (event) => {
  const send = (percent, detail) => {
    if (!event.sender.isDestroyed()) event.sender.send('system:bigItems:progress', Math.max(0, Math.min(100, Math.round(percent))), detail);
  };
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
  const roots = process.platform === 'win32'
    ? [path.join(process.env.ProgramFiles ?? 'C:\\Program Files'), path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'), localAppData]
    : ['/usr', '/opt', home];
  const seen = new Set();
  const items = [];
  const activeRoots = [];
  for (const root of roots) {
    if (await pathExists(root)) activeRoots.push(root);
  }
  let doneRoots = 0;
  for (const root of activeRoots) {
    send((doneRoots / Math.max(1, activeRoots.length)) * 100, root);
    doneRoots += 1;
    let entries = [];
    try { entries = await fsPromises.readdir(root, { withFileTypes: true }); } catch { continue; }
    const dirs = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => path.join(root, entry.name));
    // 4 at a time keeps the CPU calm while the page shows the progress bar.
    for (let index = 0; index < dirs.length; index += 4) {
      const batch = dirs.slice(index, index + 4);
      const sizes = await Promise.all(batch.map((dir) => dirSize(dir, { maxDepth: 5, timeoutMs: 5000 }).catch(() => 0)));
      batch.forEach((dir, offset) => {
        const key = dir.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        items.push({ name: path.basename(dir), path: dir, size: sizes[offset] });
      });
    }
  }
  send(100, 'Готово');
  return items.sort((a, b) => b.size - a.size).slice(0, 12);
});

/** Best-effort NTE cache cleanup: find NTE-shaped folders and drop their
 *  cache/log subfolders. Nothing outside those subfolders is touched. */
const GAME_HINTS = ['nte', 'where winds meet', 'wwm'];
ipcMain.handle('system:gameClean', async () => {
  const home = os.homedir();
  const roots = [
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
    path.join(home, 'Documents'),
    process.env.ProgramFiles ?? 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
  ].filter(Boolean);
  const found = [];
  let freed = 0;
  for (const root of roots) {
    if (!(await pathExists(root))) continue;
    let entries = [];
    try { entries = await fsPromises.readdir(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (!GAME_HINTS.includes(entry.name.toLowerCase())) continue;
      const gameDir = path.join(root, entry.name);
      found.push(gameDir);
      let inner = [];
      try { inner = await fsPromises.readdir(gameDir, { withFileTypes: true }); } catch { continue; }
      for (const child of inner) {
        if (!['cache', 'caches', 'logs', 'shadercache', 'temp'].includes(child.name.toLowerCase())) continue;
        const full = path.join(gameDir, child.name);
        const size = child.isDirectory() ? await dirSize(full, { maxDepth: 3, timeoutMs: 3000 }).catch(() => 0) : 0;
        try { await fsPromises.rm(full, { recursive: true, force: true }); freed += size; } catch { /* locked */ }
      }
    }
  }
  return { found, freed };
});

// Robust page loading: show the window as soon as the page rendered, retry on
// network failures, and always show even if rendering somehow stalls. This
// guarantees the user never stares at an empty (or invisible) window.
const LOAD_RETRIES = 5;
const SHOW_FALLBACK_MS = 12_000;

function loadInto(window, windowName) {
  let retries = 0;
  let shown = false;
  const show = () => {
    if (shown || window.isDestroyed()) return;
    shown = true;
    window.show();
  };
  // Absolute worst case: reveal the window even if no load event ever arrives.
  const fallback = setTimeout(show, SHOW_FALLBACK_MS);

  const startLoad = () => {
    if (DEV_URL) {
      void window.loadURL(`${DEV_URL}/?window=${windowName}`);
    } else {
      void window.loadFile(path.join(ROOT, 'dist-web', 'index.html'), { query: { window: windowName } });
    }
  };

  window.webContents.on('did-finish-load', () => { clearTimeout(fallback); show(); });
  window.webContents.on('dom-ready', () => { clearTimeout(fallback); show(); });
  // A crashed renderer leaves a blank window — reload it instead.
  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || window.isDestroyed()) return;
    if (retries < LOAD_RETRIES) {
      retries += 1;
      setTimeout(() => { if (!window.isDestroyed()) startLoad(); }, 300);
    }
  });
  window.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ERR_ABORTED (reload/close) */) return;
    clearTimeout(fallback);
    if (retries < LOAD_RETRIES) {
      retries += 1;
      setTimeout(() => { if (!window.isDestroyed()) startLoad(); }, 400 * retries);
    } else {
      // Retries exhausted: show whatever rendered instead of hanging forever.
      show();
    }
  });

  startLoad();
}

function sendState(window, channel) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(channel, {
    maximized: window.isMaximized() || window.isFullScreen(),
    minimized: window.isMinimized(),
    focused: window.isFocused(),
  });
}

// Windows 11 (build 22000+) rounds corners natively. On Windows 10 we make the
// window transparent and let the renderer paint a rounded card instead.
function supportsNativeRounding() {
  if (process.platform !== 'win32') return true;
  const parts = process.getSystemVersion().split('.');
  const major = Number(parts[0] ?? 0);
  const build = Number(parts[2] ?? 0);
  return major > 10 || build >= 22000;
}

// The glass rim frame (renderer-side, see src/glassFrame.ts) needs a
// transparent window so its translucent edge and outer glow can blend with
// the desktop. We disable native DWM rounding and paint our own rounded card
// in the renderer on every supported platform.
function useGlassFrame() {
  return process.platform !== 'linux'; // Linux WM transparency is unreliable outside compositors.
}

function windowPrefs(overrides = {}) {
  const glass = useGlassFrame();
  return {
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: glass ? '#00000000' : '#101012',
    transparent: glass,
    roundedCorners: !glass,
    icon: path.join(ROOT, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
    ...overrides,
  };
}

/** Плавно анимирует границы окна к целевым (macOS-подобный easeOutCubic). */
function animateWindowBounds(window, target, duration = 320) {
  const start = window.getBounds();
  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (window.isDestroyed()) { clearInterval(timer); return; }
    const progress = Math.min(1, (Date.now() - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    window.setBounds({
      x: Math.round(start.x + (target.x - start.x) * eased),
      y: Math.round(start.y + (target.y - start.y) * eased),
      width: Math.round(start.width + (target.width - start.width) * eased),
      height: Math.round(start.height + (target.height - start.height) * eased),
    });
    if (progress >= 1) clearInterval(timer);
  }, 16);
}

function guardNavigation(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (/^https?:/i.test(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}

function createLoadingWindow() {
  loadingWindow = new BrowserWindow(windowPrefs({
    width: 690,
    height: 460,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    backgroundColor: useGlassFrame() ? '#00000000' : supportsNativeRounding() ? '#000000' : '#00000000',
  }));
  loadInto(loadingWindow, 'loading');
  guardNavigation(loadingWindow);
  loadingWindow.once('ready-to-show', () => loadingWindow?.show());
  loadingWindow.on('closed', () => { loadingWindow = null; });
}

function createAuthWindow() {
  authWindow = new BrowserWindow(windowPrefs({
    width: 430,
    height: 700,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
  }));
  loadInto(authWindow, 'auth');
  guardNavigation(authWindow);
  // The window stays hidden until the renderer says the login form is needed
  // ('auth:show'). If a saved session exists, the renderer jumps straight to
  // 'auth:success' and the login form never appears at all. The timer is a
  // safety net so a stuck renderer can never leave the user without a window.
  let revealed = false;
  const reveal = () => {
    if (revealed || !authWindow || authWindow.isDestroyed()) return;
    revealed = true;
    authWindow.show();
  };
  authWindow.once('ready-to-show', () => setTimeout(reveal, 5_000));
  authWindow.once('show', () => { revealed = true; });
  authWindow.on('maximize', () => sendState(authWindow, 'window:state'));
  authWindow.on('unmaximize', () => sendState(authWindow, 'window:state'));
  authWindow.on('focus', () => sendState(authWindow, 'window:state'));
  authWindow.on('blur', () => sendState(authWindow, 'window:state'));
  authWindow.on('closed', () => {
    authWindow = null;
    // Closing the login window without logging in quits the app.
    if (!mainWindow && !quitRequested) app.quit();
  });
}

function createMainWindow(accountEmail) {
  mainWindow = new BrowserWindow(windowPrefs({
    width: 1280,
    height: 832,
    minWidth: 940,
    minHeight: 600,
  }));
  loadInto(mainWindow, 'main');
  guardNavigation(mainWindow);
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // macOS-подобная анимация открытия: окно распахивается из 94% в полный
    // размер, рендер одновременно мягко проявляется (см. .app-shell в CSS).
    const target = mainWindow.getBounds();
    const zoomedWidth = Math.round(target.width * 0.94);
    const zoomedHeight = Math.round(target.height * 0.94);
    mainWindow.setBounds({
      x: target.x + Math.round((target.width - zoomedWidth) / 2),
      y: target.y + Math.round((target.height - zoomedHeight) / 2),
      width: zoomedWidth,
      height: zoomedHeight,
    });
    mainWindow.show();
    animateWindowBounds(mainWindow, target, 320);
    // Close the intermediate windows once the main app is visible.
    if (loadingWindow && !loadingWindow.isDestroyed()) loadingWindow.close();
    if (authWindow && !authWindow.isDestroyed()) authWindow.close();
    // Внешняя HUD-пилюля включена по умолчанию.
    hudEnabled = true;
    createHudWindow();
  });
  mainWindow.on('maximize', () => sendState(mainWindow, 'window:state'));
  mainWindow.on('unmaximize', () => sendState(mainWindow, 'window:state'));
  mainWindow.on('minimize', () => sendState(mainWindow, 'window:state'));
  mainWindow.on('restore', () => sendState(mainWindow, 'window:state'));
  mainWindow.on('focus', () => sendState(mainWindow, 'window:state'));
  mainWindow.on('blur', () => sendState(mainWindow, 'window:state'));
  mainWindow.on('closed', () => { mainWindow = null; destroyHudWindow(); });
  mainWindow.__accountEmail = accountEmail ?? null;
  // HUD прилеплен к краю экрана, а не окна — синхронизация с перемещениями
  // главного окна больше не нужна.
  mainWindow.on('minimize', () => { if (hudWindow && !hudWindow.isDestroyed()) hudWindow.hide(); });
  mainWindow.on('restore', () => { if (hudEnabled && hudWindow && !hudWindow.isDestroyed()) hudWindow.showInactive(); });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const target = mainWindow ?? authWindow ?? loadingWindow;
    if (target) {
      if (target.isMinimized()) target.restore();
      target.focus();
    }
  });

  app.whenReady().then(() => {
    // ----- window controls (auth & main windows) -----
    const active = () => mainWindow ?? authWindow ?? loadingWindow;
    ipcMain.handle('window:minimize', () => active()?.minimize());
    ipcMain.handle('window:maximizeToggle', () => {
      const window = active();
      if (!window) return;
      if (window.isFullScreen()) { window.setFullScreen(false); return; }
      if (window.isMaximized()) window.unmaximize();
      else window.maximize();
    });
    ipcMain.handle('window:close', () => { active()?.close(); });
    ipcMain.handle('window:getState', () => {
      const window = active();
      return {
        maximized: window ? (window.isMaximized() || window.isFullScreen()) : false,
        minimized: window ? window.isMinimized() : false,
        focused: window ? window.isFocused() : false,
      };
    });

    // ----- phase switching -----
    ipcMain.on('loading:done', () => {
      if (loadingWindow && !loadingWindow.isDestroyed()) loadingWindow.close();
      if (!authWindow || authWindow.isDestroyed()) createAuthWindow();
    });

    // Auth renderer decided the login form is needed (no saved session).
    ipcMain.on('auth:show', () => {
      if (authWindow && !authWindow.isDestroyed() && !authWindow.isVisible()) authWindow.show();
    });

    ipcMain.handle('auth:success', (_event, payload) => {
      const email = typeof payload === 'string' ? payload : payload?.email;
      // The main window reuses the signed-in session (same partition).
      createMainWindow(email);
    });

    ipcMain.on('session:signout', () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
      if (!authWindow || authWindow.isDestroyed()) createAuthWindow();
      else authWindow.show();
    });

    ipcMain.handle('app:quit', () => { quitRequested = true; app.quit(); });

    // ----- HUD (внешняя пилюля за краем окна) -----
    ipcMain.handle('hud:setEnabled', (_event, enabled) => {
      hudEnabled = !!enabled;
      if (hudEnabled) createHudWindow();
      else destroyHudWindow();
      return hudEnabled;
    });
    ipcMain.handle('hud:getEnabled', () => hudEnabled);
    // Приложение пушит состояние макросов в HUD-окно. Число активных макросов
    // задаёт высоту пилюли — окно плавно растягивается/сжимается (macOS-стиль).
    let lastHudCount = -1;
    ipcMain.on('hud:state', (_event, payload) => {
      if (!hudWindow || hudWindow.isDestroyed()) return;
      hudWindow.webContents.send('hud:state', payload);
      const count = Array.isArray(payload?.macros) ? payload.macros.length : 0;
      if (count !== lastHudCount) {
        lastHudCount = count;
        animateHudHeight(hudHeightForCount(count));
      }
    });
    // Клик по шестерёнке в HUD → открыть настройки в главном окне.
    ipcMain.on('hud:openSettings', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        mainWindow.webContents.send('hud:openSettings');
      }
    });

    // ----- OS notification popups (bottom-right, never steal focus) -----
    registerNotifyIpc();
    ipcMain.handle('notify:show', (_event, text, type, title) => showNotification(text, type, title));

    createLoadingWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createLoadingWindow();
    });
  });

  app.on('before-quit', () => { quitRequested = true; });

  app.on('window-all-closed', () => { app.quit(); });
}
