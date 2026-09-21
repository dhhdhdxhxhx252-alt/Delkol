import { useCallback, useEffect, useRef, useState } from 'react';

export type WorkspaceWindowState = 'open' | 'minimized' | 'closed';
type Notice = (text: string, type?: 'success' | 'info' | 'warning') => void;

export function useWorkspaceWindow(notify: Notice) {
  const [state, setState] = useState<WorkspaceWindowState>('open');
  const [fullscreen, setFullscreen] = useState(() => document.fullscreenElement === document.documentElement);
  const [focusMode, setFocusMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(false);
  const focusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === document.documentElement);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  const restore = useCallback(() => {
    setState('open');
    requestAnimationFrame(() => {
      const target = focusRef.current?.isConnected ? focusRef.current : document.querySelector<HTMLElement>('.app-shell .window-minimize');
      target?.focus({ preventScroll: true });
    });
  }, []);

  const hide = useCallback((next: 'minimized' | 'closed') => {
    if (pendingRef.current) return;
    focusRef.current = document.activeElement as HTMLElement | null;
    setFocusMode(false);
    setState(next);
    if (document.fullscreenElement === document.documentElement) {
      void document.exitFullscreen().catch(() => notify('Для выхода из полноэкранного режима нажмите Esc.', 'info'));
    }
  }, [notify]);

  const toggleMaximize = useCallback(async () => {
    if (pendingRef.current) return;
    if (focusMode) { setFocusMode(false); return; }
    pendingRef.current = true;
    setBusy(true);
    try {
      if (document.fullscreenElement === document.documentElement) {
        await document.exitFullscreen();
      } else if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setFullscreen(document.fullscreenElement === document.documentElement);
      } else {
        setFocusMode(true);
        notify('Полный экран ограничен браузером. Рабочая область развёрнута внутри вкладки.', 'info');
      }
    } catch {
      if (document.fullscreenElement === document.documentElement) {
        notify('Нажмите Esc, чтобы выйти из полноэкранного режима.', 'info');
      } else {
        // Embedded previews can deny fullscreen; keep a reversible in-page alternative.
        setFocusMode(true);
        notify('Браузер не разрешил полный экран. Включён расширенный вид во вкладке.', 'info');
      }
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }, [focusMode, notify]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return;
      if (state === 'minimized') restore();
      if (focusMode) setFocusMode(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [state, focusMode, restore]);

  return { state, isMaximized: fullscreen || focusMode, focusMode, busy, restore, toggleMaximize, minimize: () => hide('minimized'), close: () => hide('closed') };
}