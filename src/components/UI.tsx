import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Check, ChevronRight, Ellipsis, Folder, Layers, Pencil, Play, Settings2, Trash2, X, type LucideIcon } from 'lucide-react';
import { formatTime, macroWord, type ActivityEvent, type Macro, type MacroGroup, type MacroKind } from '../data';
import { DepthIcon } from './DepthIcon';
import type { MacroPhase } from '../macros/runtime';
import { BRAND_NAME, DELKOL_MARK_PATH } from '../brand';

export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <svg className="delkol-mark" width={small ? 24 : 30} height={small ? 24 : 30} viewBox="0 0 1080 1080" fill="none" aria-hidden="true" focusable="false">
      <path d={DELKOL_MARK_PATH} fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
}

export function IconButton({ icon: Icon, label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return <button type="button" className={`icon-button ${className}`} title={label} aria-label={label} {...props}><Icon size={18} strokeWidth={1.65} /></button>;
}

export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={(event) => { event.stopPropagation(); onChange(); }} className={`toggle ${checked ? 'is-on' : ''}`}><span /></button>;
}

export function MacroIcon({ kind, size = 22 }: { kind: MacroKind; size?: number }) {
  return <span className={`macro-icon ${kind}`}><DepthIcon kind={kind} size={size} /></span>;
}

export function Modal({ title, subtitle, children, onClose, wide = false, className = '', hideHeading = false, section = BRAND_NAME }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean; className?: string; hideHeading?: boolean; section?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? []).filter((element) => element.tabIndex >= 0 && !element.closest('[inert]') && element.getClientRects().length > 0);
    const timer = window.setTimeout(() => {
      const input = ref.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type="checkbox"]):not([type="file"]):not([type="hidden"]), textarea');
      (input ?? focusable()[0])?.focus();
    }, 80);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab') {
        const elements = focusable();
        if (!elements.length) return;
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!ref.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', handleKey); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);

  return (
    <motion.div className="modal-backdrop frosted-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .22 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`modal modal-glass ${wide ? 'modal-wide' : ''} ${className}`} initial={{ opacity: 0, y: 12, scale: 0.975 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.985 }} transition={{ duration: 0.24, ease: [.2, .7, .3, 1] }}>
        <div className="modal-chrome"><div><Settings2 size={14} strokeWidth={1.5} /><span>{section}</span><ChevronRight size={11} /><strong>{title}</strong></div><IconButton icon={X} label="Закрыть" onClick={onClose} /></div>
        <div className="modal-content">
          {!hideHeading && <div className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>}
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function EmptyState({ icon: Icon = Folder, title, description, action }: { icon?: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><Icon size={32} strokeWidth={1.25} /><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function GroupCard({ group, macroCount, running, menuOpen, onMenu, onOpen, onEdit, onDelete, onRun }: { group: MacroGroup; macroCount: number; running: boolean; menuOpen: boolean; onMenu: () => void; onOpen: () => void; onEdit: () => void; onDelete: () => void; onRun: () => void }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!menuOpen) return;
    const updatePosition = () => {
      const bounds = anchorRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setPosition({ left: Math.max(12, Math.min(bounds.right - 192, window.innerWidth - 204)), top: Math.max(12, Math.min(bounds.bottom + 7, window.innerHeight - 154)) });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => { window.removeEventListener('resize', updatePosition); window.removeEventListener('scroll', updatePosition, true); };
  }, [menuOpen]);

  return (
    <>
      <div className={`group-card ${running ? 'group-running' : ''}`} style={{ '--group-color': group.color } as CSSProperties}>
        <button className="group-open-area" onClick={onOpen} aria-label={`Открыть группу ${group.name}`} />
        <div className="group-card-top"><DepthIcon kind="folder" size={28} className="group-folder" /><div className="group-menu-wrapper" ref={anchorRef}><IconButton icon={Ellipsis} label={`Действия с группой ${group.name}`} aria-expanded={menuOpen} onClick={onMenu} /></div></div>
        <h3>{group.name}</h3>
        <p className="group-description">{group.description}</p>
        <div className="group-card-bottom"><span><Layers size={12} />{macroCount} {macroWord(macroCount)}{running && <><span className="group-meta-dot" />В работе</>}</span><button className="group-run" onClick={onRun} aria-label={`Запустить ${group.name}`} title={`Запустить ${group.name}`}><Play size={13} /></button></div>
      </div>
      {createPortal(<AnimatePresence>{menuOpen && <motion.div className="portal-menu-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}><button className="menu-dismiss" tabIndex={-1} aria-label="Закрыть меню" onClick={onMenu} /><div className="dropdown group-dropdown portaled-dropdown" style={position}><button onClick={onEdit}><Pencil size={15} />Редактировать</button><button onClick={onRun}><Play size={15} />Запустить группу</button><div className="menu-separator" /><button className="danger-text" onClick={onDelete}><Trash2 size={15} />Удалить группу</button></div></motion.div>}</AnimatePresence>, document.body)}
    </>
  );
}

export function MacroTable({ macros, running, onToggle, onEdit, compact = false, grid = false, phases = {} }: { macros: Macro[]; running: boolean; onToggle: (id: string) => void; onEdit: (macro: Macro) => void; compact?: boolean; grid?: boolean; phases?: Record<string, MacroPhase> }) {
  const phaseLabels: Record<MacroPhase, string> = { waiting: 'Ожидание', running: 'В работе', break: 'Перерыв', retry: 'Повтор', paused: 'Пауза', stopped: 'Завершён' };
  if (!macros.length) return <EmptyState icon={Layers} title="Здесь пока нет макросов" description="Добавьте макрос или измените условия поиска." />;
  return (
    <div className={`macro-list ${compact ? 'macro-list-compact' : ''} ${grid ? 'macro-grid' : ''}`}>
      {macros.map((macro) => (
        <div className={`macro-row ${running && macro.enabled ? 'macro-running' : ''}`} key={macro.id}>
          <button className="macro-main" onClick={() => onEdit(macro)}><MacroIcon kind={macro.kind} /><span className="macro-copy"><strong>{macro.name}</strong><span>{macro.description}</span></span></button>
          <span className={`macro-status ${running && macro.enabled ? `status-running phase-${phases[macro.id] ?? 'running'}` : ''}`}><i />{running && macro.enabled ? phaseLabels[phases[macro.id] ?? 'running'] : macro.enabled ? 'Готов' : 'Выключен'}</span>
          <Toggle checked={macro.enabled} onChange={() => onToggle(macro.id)} label={`${macro.enabled ? 'Выключить' : 'Включить'} макрос ${macro.name}`} />
        </div>
      ))}
    </div>
  );
}

export function ActivityList({ events, limit = 4 }: { events: ActivityEvent[]; limit?: number }) {
  if (!events.length) return <EmptyState icon={Check} title="Пока тихо" description="События появятся после первого действия." />;
  return <div className="activity-list">{events.slice(0, limit).map((event, index) => <div className={`activity-item activity-${event.type}`} key={event.id}><span className={`activity-marker ${index === 0 ? 'first' : ''}`}>{event.type === 'success' ? <Check size={10} strokeWidth={2.4} /> : <span />}</span><div className="activity-copy"><strong>{event.title}</strong><span>{event.detail}</span></div><time>{formatTime(event.time)}</time></div>)}</div>;
}

export function SectionLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="section-link" onClick={onClick}>{children}<ArrowUpRight size={14} /></button>;
}

export function Breadcrumb({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <><ChevronRight size={13} />{onClick ? <button className="breadcrumb-current" onClick={onClick}>{children}</button> : <span className="breadcrumb-current">{children}</span>}</>;
}