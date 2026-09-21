import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Bell, Check, ChevronRight, CircleHelp, Download, Ellipsis, FileJson, HardDrive, Keyboard, Layers, Monitor, Pencil, Plus, RotateCcw, Save, Search, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Upload } from 'lucide-react';
import { macroWord, type Macro, type MacroGroup, type Profile, type Settings } from '../data';
import type { CloudAccount } from '../lib/supabase';
import type { CommunityConfig, CommunityProfile } from '../lib/community';
import { TopConfigs, FrameShop } from './Community';
import { OptimizePanel } from './OptimizePanel';
import { configFingerprint, type SavedConfig, type SettingsTab } from '../utils/config';
import { Avatar } from './Avatar';
import { EmptyState, IconButton, Toggle } from './UI';
import { assetUrl } from '../paths';
import { DepthIcon } from './DepthIcon';
import { PanelFrame } from './Ornaments';
import { BRAND_NAME } from '../brand';

interface SettingsPageProps {
  settings: Settings;
  profile: Profile;
  macros: Macro[];
  groups: MacroGroup[];
  configs: SavedConfig[];
  activeConfigId: string;
  tab: SettingsTab;
  storageHealthy: boolean;
  onTab: (tab: SettingsTab) => void;
  onChange: (patch: Partial<Settings>) => void;
  onSaveConfig: () => void;
  onImportConfig: () => void;
  onApplyConfig: (config: SavedConfig) => void;
  onDownloadConfig: (config: SavedConfig) => void;
  onRenameConfig: (config: SavedConfig) => void;
  onUpdateConfig: (config: SavedConfig) => void;
  onDeleteConfig: (config: SavedConfig) => void;
  onProfile: () => void;
  onHelp: () => void;
  onReset: () => void;
  account: CloudAccount | null;
  communityProfile: CommunityProfile | null;
  onNotify: (message: string, type?: 'success' | 'info' | 'warning') => void;
  onApplyCommunityConfig: (row: CommunityConfig) => void;
  onFrameChanged: (coins: number, owned: string[], equipped: string) => void;
}

const TABS: { value: SettingsTab; label: string }[] = [{ value: 'configs', label: 'Конфигурации' }, { value: 'top', label: 'Топ конфиги' }, { value: 'shop', label: 'Магазин' }, { value: 'appearance', label: 'Интерфейс' }, { value: 'optimize', label: 'Оптимизация' }, { value: 'session', label: 'Управление' }];

export function SettingsPage({ settings, profile, macros, groups, configs, activeConfigId, tab, storageHealthy, onTab, onChange, onSaveConfig, onImportConfig, onApplyConfig, onDownloadConfig, onRenameConfig, onUpdateConfig, onDeleteConfig, onProfile, onHelp, onReset, account, communityProfile, onNotify, onApplyCommunityConfig, onFrameChanged }: SettingsPageProps) {
  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState<{ config: SavedConfig; left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeConfig = configs.find((item) => item.id === activeConfigId);
  const fingerprint = configFingerprint(macros, groups, settings);
  const unchanged = !!activeConfig && configFingerprint(activeConfig.config.macros, activeConfig.config.groups, activeConfig.config.settings) === fingerprint;
  const filtered = configs.filter((item) => `${item.config.name} ${item.config.description}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (!menu) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus());
    const close = () => setMenu(null);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', escape); window.addEventListener('resize', close); window.addEventListener('scroll', close, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', escape); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true);
      if (previousFocus?.isConnected && !document.querySelector('[aria-modal="true"]')) previousFocus.focus({ preventScroll: true });
    };
  }, [menu]);

  return <>
    <div className="page-heading preferences-heading"><div><h1>Настройки<span className="heading-dot">.</span></h1><p>Ваше пространство. Ваши правила.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={onImportConfig}><Upload size={14} />Добавить конфиг</button><button className="button button-primary" onClick={onSaveConfig}><Save size={14} />Сохранить конфиг</button></div></div>
    <div className="preferences-cover"><img src={assetUrl('/images/settings-sky.jpg')} alt="Светлые облака над лесом, обрамлённые ветвями дерева" /><div /><PanelFrame /></div>
    <div className="preferences-layout">
      <div className="preferences-main">
        <div className="preferences-tabbar"><div className="preferences-tabs" role="tablist" aria-label="Разделы настроек">{TABS.map((item) => <button key={item.value} id={`preference-tab-${item.value}`} role="tab" aria-selected={tab === item.value} aria-controls={`preference-panel-${item.value}`} tabIndex={tab === item.value ? 0 : -1} onClick={() => onTab(item.value)} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const index = TABS.findIndex((entry) => entry.value === tab);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
          onTab(TABS[next].value); document.getElementById(`preference-tab-${TABS[next].value}`)?.focus();
        }} className={tab === item.value ? 'active' : ''}>{item.label}{item.value === 'configs' && <span>{configs.length}</span>}</button>)}</div><IconButton icon={CircleHelp} label="Помощь по настройкам" onClick={onHelp} /></div>
        <motion.div className="preferences-panel" role="tabpanel" id={`preference-panel-${tab}`} aria-labelledby={`preference-tab-${tab}`} key={tab} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}>
          {tab === 'configs' && <>
            <div className="preferences-section-heading"><div><h2>Сохранённые конфиги</h2><p>Любимый сценарий всегда под рукой.</p></div><div className="input-search config-search"><Search size={14} /><input placeholder="Найти конфиг..." aria-label="Поиск конфигурации" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>
            <div className="config-list">{filtered.length ? filtered.map((item) => {
              const active = item.id === activeConfigId;
              const isCurrent = active && unchanged;
              return <div className={`config-row ${active ? 'active' : ''}`} key={item.id}>
                <button className="config-row-main" onClick={() => onApplyConfig(item)} aria-label={`Применить конфиг ${item.config.name}`}>
                  <span className={`config-file-symbol ${item.source === 'backup' ? 'is-backup' : ''}`}><DepthIcon kind="config" size={30} /></span>
                  <span className="config-row-copy"><strong>{item.config.name}<span>.json</span></strong><span>{item.config.macros.length} {macroWord(item.config.macros.length)}<i />Групп: {item.config.groups.length}<i />{item.source === 'backup' ? 'Резервная копия' : new Date(item.savedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span></span>
                </button>
                <div className="config-row-actions">{active && <span className={`config-current ${!unchanged ? 'modified' : ''}`}>{isCurrent ? <Check size={12} /> : <i />}{isCurrent ? 'Текущий' : 'Изменён'}</span>}<IconButton icon={Download} label={`Скачать ${item.config.name}`} onClick={() => onDownloadConfig(item)} /><IconButton icon={Ellipsis} label={`Действия с конфигом ${item.config.name}`} aria-expanded={menu?.config.id === item.id} onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); setMenu(menu?.config.id === item.id ? null : { config: item, left: Math.max(12, Math.min(bounds.right - 222, window.innerWidth - 234)), top: Math.max(12, Math.min(bounds.bottom + 6, window.innerHeight - 210)) }); }} /></div>
              </div>;
            }) : <EmptyState icon={FileJson} title={search ? 'Такого конфига пока нет' : 'Сохраните свой первый конфиг'} description={search ? 'Попробуйте другое название.' : 'Макросы, группы и настройки в одном небольшом файле.'} action={!search && <button className="button button-secondary" onClick={onSaveConfig}><Plus size={14} />Создать конфиг</button>} />}</div>
            <button className="config-add-row" onClick={onImportConfig}><span><Plus size={17} strokeWidth={1.5} /></span><div><strong>Добавить конфигурацию</strong><p>Загрузите JSON-файл с другого устройства</p></div><ArrowUpRight size={16} /></button>
            <div className="preferences-footnote"><ShieldCheck size={14} /><span>Перед применением другого конфига создаём резервную копию. Ваш профиль остаётся без изменений.</span></div>
          </>}
          {tab === 'top' && <div className="preferences-section-heading" style={{ marginBottom: 4 }}><div><h2>Топ конфигов сообщества</h2><p>Самые любимые конфиги игроков — лайки, загрузки, просмотры.</p></div></div>}
          {tab === 'top' && <TopConfigs isSignedIn={!!account} onApply={onApplyCommunityConfig} onNotify={onNotify} />}
          {tab === 'shop' && <FrameShop account={account} profile={communityProfile} onNotify={onNotify} onPurchased={onFrameChanged} />}
          {tab === 'appearance' && <>
            <div className="preferences-section-heading"><div><h2>Всё на своих местах</h2><p>Только те детали, которые делают работу комфортнее.</p></div><Monitor size={20} strokeWidth={1.3} /></div>
            <PreferenceRow icon={<Layers size={18} />} title="Компактный интерфейс" description="Меньше отступов, больше пространства для макросов"><Toggle checked={settings.compact} onChange={() => onChange({ compact: !settings.compact })} label="Компактный интерфейс" /></PreferenceRow>
            <PreferenceRow icon={<Sparkles size={18} />} title="Плавные анимации" description="Мягкие переходы и объёмные иконки при наведении"><Toggle checked={settings.animations} onChange={() => onChange({ animations: !settings.animations })} label="Плавные анимации" /></PreferenceRow>
            <PreferenceRow icon={<Bell size={18} />} title="Уведомления о сессии" description="Сообщать о запуске и приостановке макросов"><Toggle checked={settings.notifications} onChange={() => onChange({ notifications: !settings.notifications })} label="Уведомления о сессии" /></PreferenceRow>
            <PreferenceRow icon={<Pencil size={18} />} title="Аватар и обложка" description="Настройте внешний вид личного профиля"><button className="preference-inline-link" onClick={onProfile}>Мой профиль<ArrowUpRight size={13} /></button></PreferenceRow>
            <div className="preferences-autosave"><span className={storageHealthy ? 'live-dot' : 'warning-dot'} />{storageHealthy ? 'Изменения сохраняются автоматически' : 'Сохранение недоступно. Экспортируйте конфиг.'}</div>
          </>}
          {tab === 'optimize' && <OptimizePanel onNotify={onNotify} />}
          {tab === 'session' && <>
            <div className="preferences-section-heading"><div><h2>Ваш игровой ритм</h2><p>Удобное управление без лишних действий.</p></div><SlidersHorizontal size={20} strokeWidth={1.3} /></div>
            <PreferenceRow icon={<Keyboard size={18} />} title="Запуск и пауза" description="Горячая клавиша работает в открытой вкладке"><select className="select-control" aria-label="Горячая клавиша запуска" value={settings.shortcut} onChange={(event) => onChange({ shortcut: event.target.value as Settings['shortcut'] })}><option>F6</option><option>F8</option><option>F9</option></select></PreferenceRow>
            <PreferenceRow icon={<ShieldCheck size={18} />} title="Безопасная остановка" description="Сессия завершится, если нет активных макросов"><span className="preference-protected"><Check size={13} />Всегда включена</span></PreferenceRow>
            <PreferenceRow icon={<Search size={18} />} title="Быстрый поиск" description="Найти макрос, группу или нужный раздел"><span className="key-combination"><kbd>Ctrl</kbd><span>+</span><kbd>K</kbd></span></PreferenceRow>
            <div className="preferences-reset"><div><strong>Начать с чистого листа</strong><p>Вернуть исходные макросы и настройки. Сохранённые конфиги и профиль останутся.</p></div><button className="button button-danger-ghost" onClick={onReset}><RotateCcw size={13} />Сбросить</button></div>
          </>}
        </motion.div>
      </div>
      <aside className="preferences-aside" aria-label="Информация о пространстве">
        <span className="preferences-aside-label">ЛИЧНОЕ ПРОСТРАНСТВО</span><h2>{BRAND_NAME}</h2><p>Маленькие настройки для большого комфорта. Всё нужное для вашей игры в одном месте.</p>
        <span className="preferences-local"><ShieldCheck size={13} />Только на вашем устройстве</span>
        <button className="preferences-owner" onClick={onProfile}><Avatar profile={profile} size={30} online framed /><span><strong>{profile.displayName}</strong><small>Владелец пространства</small></span><ChevronRight size={14} /></button>
        <dl className="preferences-details"><div><dt><FileJson size={14} />Конфигурация</dt><dd>{activeConfig?.config.name ?? 'Не сохранена'}</dd></div><div><dt><Layers size={14} />Макросы</dt><dd>{macros.length}</dd></div><div><dt><Keyboard size={14} />Запуск / пауза</dt><dd><kbd>{settings.shortcut}</kbd></dd></div><div><dt><HardDrive size={14} />Хранение</dt><dd>{storageHealthy ? 'Локально' : 'Временно'}</dd></div></dl>
        <button className="preferences-profile-link" onClick={onProfile}>Открыть мой профиль<ArrowRight size={14} /></button>
        <div className="preferences-aside-bottom"><span>{BRAND_NAME}</span><span>v.1.2.0</span></div>
      </aside>
    </div>
    {createPortal(<AnimatePresence>{menu && <motion.div className="portal-menu-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .12 }}>
      <button className="menu-dismiss" tabIndex={-1} aria-label="Закрыть меню конфигурации" onClick={() => setMenu(null)} />
      <div ref={menuRef} role="menu" aria-label={`Действия: ${menu.config.config.name}`} className="dropdown portaled-dropdown config-dropdown" style={{ left: menu.left, top: menu.top }} onKeyDown={(event) => {
        if (event.key === 'Tab') { event.preventDefault(); setMenu(null); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
        <button role="menuitem" onClick={() => { onApplyConfig(menu.config); setMenu(null); }}><Check size={14} />Применить конфиг</button>
        <button role="menuitem" onClick={() => { onRenameConfig(menu.config); setMenu(null); }}><Pencil size={14} />Название и описание</button>
        <button role="menuitem" onClick={() => { onUpdateConfig(menu.config); setMenu(null); }}><Save size={14} />Обновить из текущих</button>
        <div className="menu-separator" role="separator" />
        <button role="menuitem" className="danger-text" onClick={() => { onDeleteConfig(menu.config); setMenu(null); }}><Trash2 size={14} />Удалить конфиг</button>
      </div>
    </motion.div>}</AnimatePresence>, document.body)}
  </>;
}

function PreferenceRow({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return <div className="preference-row"><span className="preference-row-icon">{icon}</span><div className="preference-row-copy"><strong>{title}</strong><p>{description}</p></div><div className="preference-row-control">{children}</div></div>;
}