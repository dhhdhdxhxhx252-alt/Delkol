/**
 * Delkol desktop (Electron) overlay.
 *
 * Injects real window controls (minimize / maximize / close) into the app's
 * existing topbar — right where the simulated ones used to sit — and turns
 * the topbar into the drag region of the frameless window (double-click
 * toggles maximize). Buttons reuse the app's own .window-control styles, so
 * the design stays native to the UI.
 *
 * Everything is gated behind window.delkol: the plain web build is unaffected.
 * Styles live in desktop.css (imported from main.tsx).
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Copy, Minus, Square, X } from 'lucide-react';
import './desktop.css';

type DelkolWindowState = { maximized: boolean; minimized: boolean; focused: boolean };
type NotifyType = 'success' | 'info' | 'warning';

export interface SystemDrive { root: string; total: number; free: number }
export interface SystemInfo {
  ok: boolean;
  drives: SystemDrive[];
  memory: { total: number; free: number };
  cpu: { model: string; cores: number; speedMhz: number };
  platform: string;
  uptime: number;
  tempSize: number;
}
export interface BigItem { name: string; path: string; size: number }

declare global {
  interface Window {
    delkol?: {
      minimize: () => Promise<void>;
      toggleMaximize: () => Promise<void>;
      close: () => Promise<void>;
      getState: () => Promise<DelkolWindowState>;
      onWindowState: (callback: (state: DelkolWindowState) => void) => () => void;
      needsCssRounding?: boolean;
      glassFrame?: boolean;
      // OS notification popups (electron/notifications.cjs).
      notify?: (text: string, type?: NotifyType, title?: string) => Promise<unknown>;
      notifyPayload?: (id: string) => Promise<{ id: string; title: string; text: string; type: string } | null>;
      notifyHover?: (id: string, hovering: boolean) => void;
      notifyClose?: (id: string) => void;
      notifyFocusApp?: (id: string) => void;
      // System optimizer (Настройки → Оптимизация); absent in the plain web build.
      systemInfo?: () => Promise<SystemInfo>;
      systemBigItems?: () => Promise<BigItem[]>;
      systemTempClean?: () => Promise<{ freed: number; removed: number }>;
      systemGameClean?: () => Promise<{ found: string[]; freed: number }>;
      // Progress streaming for the optimizer bars.
      onTempCleanProgress?: (callback: (percent: number, detail: string) => void) => () => void;
      onBigItemsProgress?: (callback: (percent: number, detail: string) => void) => () => void;
      // Внешняя HUD-пилюля (отдельное прозрачное окно за краем приложения).
      hudSetEnabled?: (enabled: boolean) => Promise<boolean>;
      hudGetEnabled?: () => Promise<boolean>;
      hudPushState?: (payload: unknown) => void;
      onHudOpenSettings?: (callback: () => void) => () => void;
    };
  }
}

function WindowControls() {
  const bridge = window.delkol;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!bridge?.onWindowState) return;
    let alive = true;
    let dispose: (() => void) | undefined;
    void bridge.getState().then((s) => { if (alive) setMaximized(s.maximized); }).catch(() => {});
    dispose = bridge.onWindowState((s) => setMaximized(s.maximized));
    return () => { alive = false; dispose?.(); };
  }, [bridge]);

  return (
    <div className="window-controls" role="group" aria-label="Управление окном">
      <button type="button" className="window-control window-minimize" aria-label="Свернуть окно" title="Свернуть" onClick={() => { void bridge?.minimize(); }}>
        <Minus size={15} strokeWidth={1.6} />
      </button>
      <button
        type="button"
        className="window-control window-maximize"
        aria-label={maximized ? 'Восстановить размер окна' : 'Развернуть окно'}
        aria-pressed={maximized}
        title={maximized ? 'Восстановить размер окна' : 'Развернуть на весь экран'}
        onClick={() => { void bridge?.toggleMaximize(); }}
      >
        {maximized ? <Copy size={12} strokeWidth={1.5} /> : <Square size={12} strokeWidth={1.6} />}
      </button>
      <button type="button" className="window-control window-close" aria-label="Закрыть окно" title="Закрыть" onClick={() => { void bridge?.close(); }}>
        <X size={16} strokeWidth={1.6} />
      </button>
    </div>
  );
}

export function mountDesktop() {
  if (!window.delkol) return;

  // Rounded-corner strategy is decided by the main process (Win10 vs Win11).
  if (window.delkol.needsCssRounding) document.documentElement.classList.add('delkol-rounded');

  const findTopbar = (attempt = 0) => {
    const actions = document.querySelector('.topbar-actions');
    if (!actions) {
      if (attempt < 200) window.setTimeout(() => findTopbar(attempt + 1), 25);
      return;
    }

    // Mount the real window controls next to the share/notifications cluster.
    const host = document.createElement('div');
    host.id = 'dt-window-controls';
    actions.appendChild(host);
    createRoot(host).render(
      <StrictMode>
        <WindowControls />
      </StrictMode>,
    );

    // The topbar acts as the native drag region; double-click maximizes.
    const topbar = actions.closest('.topbar') ?? actions;
    topbar.addEventListener('dblclick', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, input, select, a, .dropdown, .menu-dismiss')) return;
      void window.delkol?.toggleMaximize();
    });
  };

  findTopbar();
}
