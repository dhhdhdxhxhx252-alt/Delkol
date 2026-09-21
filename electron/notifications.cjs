/**
 * Delkol — native-like OS notifications.
 *
 * Instead of toasts inside the app window, small frameless transparent
 * popups appear above everything in the bottom-right corner of the screen —
 * like Windows 11 notifications, but styled with Delkol's own design.
 *
 *   • never steal focus from the game (showInactive + focusable: false)
 *   • stack vertically (oldest on top, newest at the bottom), max 4 at once
 *   • auto-dismiss after ~4.5s; the timer pauses while the cursor hovers
 *   • click the card to bring Delkol to the front; the X closes one popup
 *
 * Each popup is a BrowserWindow loading this same bundle with ?window=notify.
 */

const { BrowserWindow, ipcMain, screen, app } = require('electron');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

const WIDTH = 344;
const HEIGHT = 92;
const GAP = 10;
const MARGIN_RIGHT = 14;
const MARGIN_BOTTOM = 14;
const LIFETIME_MS = Number(process.env.DELKOL_NOTIFY_LIFETIME_MS) || 4500; // override for tests
const MAX_VISIBLE = 4;

/** id -> { window, timer, remaining, startedAt, payload } */
const live = new Map();
let seq = 0;

function loadInto(window, id) {
  // Framework-free popup page — paints instantly, no 1.3MB bundle parse
  // (three of those in a burst is what produced empty windows before).
  void window.loadFile(path.join(__dirname, 'notify.html'), { search: `id=${encodeURIComponent(id)}` });
}

function placeStack() {
  const area = screen.getPrimaryDisplay().workArea;
  const ids = [...live.keys()].slice(-MAX_VISIBLE);
  // Stack grows upward from the bottom-right corner; the newest sits lowest.
  let bottom = area.y + area.height - MARGIN_BOTTOM;
  for (let i = ids.length - 1; i >= 0; i -= 1) {
    const entry = live.get(ids[i]);
    if (!entry || entry.window.isDestroyed()) continue;
    entry.window.setBounds({
      x: area.x + area.width - WIDTH - MARGIN_RIGHT,
      y: Math.round(bottom - HEIGHT),
      width: WIDTH,
      height: HEIGHT,
    });
    bottom -= HEIGHT + GAP;
  }
}

function dismiss(id) {
  const entry = live.get(id);
  if (!entry) return;
  live.delete(id);
  clearTimeout(entry.timer);
  if (!entry.window.isDestroyed()) entry.window.close();
  placeStack();
}

function armTimer(id) {
  const entry = live.get(id);
  if (!entry) return;
  entry.startedAt = Date.now();
  entry.timer = setTimeout(() => dismiss(id), entry.remaining);
}

function focusMainWindow() {
  const main = BrowserWindow.getAllWindows().find(
    (candidate) => !candidate.isDestroyed() && candidate.webContents.getURL().includes('window=main'),
  );
  if (main) { main.show(); main.focus(); }
  else void app.focus({ steal: true });
}

function createPopup(id, title, text, type) {
  // The window IS the card: opaque surface, Windows rounds the corners and
  // draws the shadow natively. (A transparent window + CSS-rounded card
  // showed a black backdrop on machines where GPU compositing falls back.)
  const window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    backgroundColor: '#17151C',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,          // never takes focus from the game
    alwaysOnTop: true,
    roundedCorners: true,      // Win11 rounds it natively; Win10 via CSS
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  window.setAlwaysOnTop(true, 'screen-saver');

  window.on('closed', () => {
    const entry = live.get(id);
    if (entry && entry.window === window) live.delete(id);
    placeStack();
  });

  loadInto(window, id);
  window.once('ready-to-show', () => {
    if (window.isDestroyed()) return;
    window.showInactive();             // no focus, no taskbar flash
    armTimer(id);
  });

  live.set(id, { window, timer: null, remaining: LIFETIME_MS, startedAt: 0, payload: { id, title, text, type, lifetimeMs: LIFETIME_MS } });

  // A crashed renderer must never leave a blank popup behind — reload once.
  window.webContents.on('render-process-gone', () => {
    if (!window.isDestroyed()) loadInto(window, id);
  });
}

/** Public API: showNotification(text, type, title). Returns the popup id. */
function showNotification(text, type = 'success', title = 'Delkol') {
  const id = `n${Date.now().toString(36)}${(seq += 1)}`;
  // Drop the oldest popup if the stack is full.
  const ids = [...live.keys()];
  if (ids.length >= MAX_VISIBLE) dismiss(ids[0]);
  createPopup(id, String(title).slice(0, 40), String(text).slice(0, 220), type);
  placeStack();
  return id;
}

function registerIpc() {
  // The renderer pulls its payload once mounted — no send/ready race.
  ipcMain.handle('notify:get', (_event, id) => live.get(String(id))?.payload ?? null);
  ipcMain.on('notify:hover', (_event, id, hovering) => {
    const entry = live.get(String(id));
    if (!entry || entry.window.isDestroyed()) return;
    if (hovering) {
      clearTimeout(entry.timer);
      entry.remaining = Math.max(1200, entry.remaining - (Date.now() - entry.startedAt));
    } else {
      armTimer(String(id));
    }
  });
  ipcMain.on('notify:close', (_event, id) => dismiss(String(id)));
  ipcMain.on('notify:focus-app', (_event, id) => {
    focusMainWindow();
    dismiss(String(id));
  });
}

module.exports = { showNotification, registerIpc };
