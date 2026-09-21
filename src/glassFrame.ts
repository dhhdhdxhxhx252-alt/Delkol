/**
 * Glass frame for the frameless Electron window.
 *
 * Three stacked, pointer-transparent layers pinned to the window edge:
 *   .glass-rim  — the "glass tube" itself: translucent bright edge with
 *                 bevels and an inner seam that read as 1–2 px of glass.
 *   .glass-bloom — faint violet light bleeding inward from the glass.
 *   .glass-spec — a rotating conic-gradient sheen that travels around the
 *                 border like light crawling through glass (the "shader").
 *
 * Intensity follows real window state from the main process: the rim dims
 * when the window loses focus and hugs the screen when maximized. Requires
 * a transparent BrowserWindow — see electron/main.cjs (transparent on
 * Win11 too now). The plain web build is unaffected.
 */
import './styles/glassFrame.css';

type WindowStateLike = { maximized: boolean; minimized: boolean; focused: boolean };

const LAYERS: Array<[string, string]> = [
  ['glass-rim', 'glass-rim'],
  ['glass-bloom', 'glass-bloom'],
  ['glass-spec', 'glass-spec'],
];

export function mountGlassFrame() {
  if (!window.delkol || document.getElementById('glass-rim')) return;

  const root = document.documentElement;
  root.classList.add('glass-frame');

  for (const [id, className] of LAYERS) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = className;
      el.setAttribute('aria-hidden', 'true');
      el.style.pointerEvents = 'none';
      root.appendChild(el);
    }
  }

  const sync = (state: WindowStateLike) => {
    root.classList.toggle('glass-frame-max', !!state.maximized);
    root.classList.toggle('glass-frame-active', state.focused !== false);
    root.classList.toggle('glass-frame-blur', state.focused === false);
  };

  void window.delkol.getState().then(sync).catch(() => undefined);
  window.delkol.onWindowState(sync);
}
