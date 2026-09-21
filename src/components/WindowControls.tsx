import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Copy, Minus, Square, X } from 'lucide-react';
import { BrandMark } from './UI';
import { formatElapsed } from '../data';
import type { WorkspaceWindowState } from '../hooks/useWorkspaceWindow';
import { BRAND_NAME } from '../brand';

export function WindowControls({ maximized, busy, onMinimize, onMaximize, onClose }: { maximized: boolean; busy: boolean; onMinimize: () => void; onMaximize: () => void; onClose: () => void }) {
  return (
    <div className="window-controls" role="group" aria-label="Управление окном" aria-busy={busy}>
      <button type="button" className="window-control window-minimize" aria-label="Свернуть окно" title="Свернуть пространство внутри вкладки" disabled={busy} onClick={onMinimize}><Minus size={15} strokeWidth={1.6} /></button>
      <button type="button" className="window-control window-maximize" aria-label={maximized ? 'Восстановить размер окна' : 'Развернуть окно'} title={maximized ? 'Восстановить размер окна' : 'Развернуть на весь экран'} aria-pressed={maximized} disabled={busy} onClick={onMaximize}>{maximized ? <Copy size={12} strokeWidth={1.5} /> : <Square size={12} strokeWidth={1.6} />}</button>
      <button type="button" className="window-control window-close" aria-label="Закрыть окно" title="Закрыть рабочее пространство" disabled={busy} onClick={onClose}><X size={16} strokeWidth={1.6} /></button>
    </div>
  );
}

export function WindowStandby({ state, running, elapsed, saved, onRestore, onClose }: { state: Exclude<WorkspaceWindowState, 'open'>; running: boolean; elapsed: number; saved: boolean; onRestore: () => void; onClose: () => void }) {
  const restoreRef = useRef<HTMLButtonElement>(null);
  const minimized = state === 'minimized';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!document.querySelector('[aria-modal="true"]')) restoreRef.current?.focus({ preventScroll: true });
    }, 230);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <motion.section className={`window-standby ${minimized ? 'is-minimized' : 'is-closed'}`} aria-label={minimized ? 'Окно свёрнуто' : 'Окно закрыто'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>
      <div className="standby-message">
        <BrandMark />
        <h1>{BRAND_NAME}</h1>
        <p>{minimized ? 'Пространство свёрнуто. Ваш ритм сохранён.' : 'Пространство закрыто. До следующей игры.'}</p>
        <span>{minimized ? running ? 'Демо-сессия продолжает работать в этой вкладке.' : 'Вернитесь, когда будете готовы.' : saved ? 'Макросы, группы и настройки сохранены на устройстве.' : 'Данные остались в этой вкладке. Экспортируйте их перед выходом.'}</span>
        {!minimized && <button ref={restoreRef} className="button button-secondary" onClick={onRestore}>Открыть снова<ArrowRight size={15} /></button>}
      </div>
      {minimized && <motion.div className="minimized-dock" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: .25 }}>
        <button className="dock-restore" ref={restoreRef} onClick={onRestore} title="Восстановить окно" aria-label={`Восстановить окно ${BRAND_NAME}`}><BrandMark small /><span><strong>{BRAND_NAME}</strong><small>{running ? `Сессия активна / ${formatElapsed(elapsed)}` : 'Окно свёрнуто'}</small></span><Copy size={14} /></button>
        <button className="window-control window-close" onClick={onClose} title="Закрыть рабочее пространство" aria-label="Закрыть окно"><X size={15} /></button>
      </motion.div>}
      {minimized && <span className="standby-shortcut"><kbd>Esc</kbd> восстановить окно</span>}
    </motion.section>
  );
}