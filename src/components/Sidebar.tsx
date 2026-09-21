import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { BarChart3, Bell, ChevronDown, CircleHelp, Ellipsis, FileJson, FolderOpen, House, Moon, PanelLeftClose, PanelLeftOpen, Plus, ScrollText, Search, Settings2, Shapes, Sparkles, Sun, UserRound } from 'lucide-react';
import { PAGE_LABELS, type MacroGroup, type Page, type Profile, type Settings } from '../data';
import type { SavedConfig } from '../utils/config';
import { Avatar } from './Avatar';
import { BrandMark, IconButton, Toggle } from './UI';
import { DepthIcon } from './DepthIcon';
import { BRAND_NAME } from '../brand';

interface SidebarProps {
  page: Page; profile: Profile; settings: Settings; groups: MacroGroup[]; configs: SavedConfig[];
  activeConfigId: string; selectedGroupId: string | null; macroCount: number; unread: boolean;
  collapsed: boolean; mobileOpen: boolean; focusMode: boolean; onNavigate: (page: Page, groupId?: string | null) => void;
  /** Discord-style popup instead of a direct jump when clicking the avatar. */
  onProfilePopup: (point: { x: number; y: number }) => void;
  onSearch: () => void; onNotifications: () => void; onConfigs: () => void; onCreateGroup: () => void;
  onSaveConfig: () => void; onHelp: () => void; onUpdates: () => void;
  onCollapse: () => void; onMobileClose: () => void; onAnimations: () => void;
  theme?: 'dark' | 'light';
  /** Origin (viewport point of the toggle) anchors the radial theme-wipe animation. */
  onTheme: (next: 'dark' | 'light', origin: { x: number; y: number }) => void;
}

const NAV = [{ page: 'overview' as Page, icon: House }, { page: 'macros' as Page, icon: Shapes }, { page: 'groups' as Page, icon: FolderOpen }, { page: 'stats' as Page, icon: BarChart3 }, { page: 'logs' as Page, icon: ScrollText }];

export function Sidebar({ page, profile, settings, groups, configs, activeConfigId, selectedGroupId, macroCount, unread, collapsed, mobileOpen, focusMode, onNavigate, onProfilePopup, onSearch, onNotifications, onConfigs, onCreateGroup, onSaveConfig, onHelp, onUpdates, onCollapse, onMobileClose, onAnimations, theme = 'dark', onTheme }: SidebarProps) {
  const [more, setMore] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [configsOpen, setConfigsOpen] = useState(true);
  /** Viewport point of the clicked avatar — anchors the profile popup beside it. */
  const openPopupAt = (event: ReactMouseEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onProfilePopup({ x: bounds.right, y: bounds.top + bounds.height / 2 });
  };
  const [overlayLayout, setOverlayLayout] = useState(() => window.matchMedia('(max-width: 1050px)').matches);
  const sidebarHidden = overlayLayout || focusMode ? !mobileOpen : collapsed;
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1050px)');
    const change = () => setOverlayLayout(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => setMore(false), [page, sidebarHidden]);
  useEffect(() => {
    if (!more) return;
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMore(false); };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [more]);

  return <>
    <aside className="icon-rail rail-v2" aria-label="Приложения">
      <button className="brand-symbol" title={BRAND_NAME} aria-label={`На главную ${BRAND_NAME}`} onClick={() => onNavigate('overview')}><BrandMark small /></button>
      <div className="rail-workspaces">
        <button className="rail-workspace active delkol-workspace" title={`Рабочее пространство ${BRAND_NAME}`} aria-label={`Рабочее пространство ${BRAND_NAME}`} onClick={() => onNavigate('overview')}><DepthIcon kind="workspace" size={29} /></button>
        <button className={`rail-workspace ${page === 'settings' ? 'rail-settings-active' : ''}`} title="Конфигурации" aria-label="Открыть конфигурации" onClick={onConfigs}><DepthIcon kind="config" size={25} /></button>
        <span className="rail-divider" /><button className="rail-add" title="Создать группу" aria-label="Создать группу" onClick={onCreateGroup}><Plus size={19} strokeWidth={1.4} /></button>
      </div>
      <div className="rail-bottom"><IconButton icon={CircleHelp} label="Помощь и поддержка" onClick={onHelp} /><IconButton icon={collapsed ? PanelLeftOpen : PanelLeftClose} label={collapsed ? 'Развернуть сайдбар' : 'Свернуть сайдбар'} className="desktop-collapse" onClick={onCollapse} /><button className="rail-profile-v2" title="Мой профиль" aria-label="Открыть карточку профиля" onClick={openPopupAt}><Avatar profile={profile} size={26} online framed /></button></div>
    </aside>
    {mobileOpen && <button className="sidebar-veil" aria-label="Закрыть навигацию" onClick={onMobileClose} />}
    <aside className={`workspace-sidebar sidebar-v2 ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Основная навигация" inert={sidebarHidden} aria-hidden={sidebarHidden ? true : undefined}>
      <div className="sidebar-v2-heading"><button className="sidebar-workspace-name" onClick={() => setMore(!more)} aria-expanded={more}><span className="delkol-sidebar-wordmark">{BRAND_NAME}</span><ChevronDown size={12} /></button><button className="sidebar-owner-avatar" title={`Мой профиль: ${profile.displayName}`} aria-label="Открыть карточку профиля" onClick={openPopupAt}><Avatar profile={profile} size={26} online framed /></button>
        {more && <><button className="menu-dismiss" aria-label="Закрыть меню пространства" onClick={() => setMore(false)} /><div className="dropdown sidebar-v2-menu"><div className="dropdown-caption">ВАШЕ ПРОСТРАНСТВО</div><button onClick={() => { onNavigate('profile'); setMore(false); }}><UserRound size={15} />Мой профиль</button><button onClick={() => { onConfigs(); setMore(false); }}><FileJson size={15} />Конфигурации</button><div className="menu-separator" /><button onClick={() => { onUpdates(); setMore(false); }}><Sparkles size={15} />Что нового</button><button onClick={() => { onHelp(); setMore(false); }}><CircleHelp size={15} />Помощь и поддержка</button></div></>}
      </div>
      <div className="sidebar-v2-scroll">
        <div className="sidebar-v2-utilities"><button className="sidebar-utility-v2 sidebar-search-v2" onClick={onSearch}><Search size={16} strokeWidth={1.5} /><span>Найти что-нибудь...</span><kbd>Ctrl K</kbd></button><button className="sidebar-utility-v2" onClick={onNotifications}><Bell size={16} strokeWidth={1.5} /><span>Уведомления</span>{unread && <i className="sidebar-unread" />}</button><button className={`sidebar-utility-v2 ${page === 'settings' ? 'selected' : ''}`} onClick={onConfigs}><FileJson size={16} strokeWidth={1.5} /><span>Конфигурации</span><span className="utility-count">{configs.length}</span></button></div>
        <div className="sidebar-v2-separator" />
        <nav className="primary-nav sidebar-nav-v2">{NAV.map(({ page: item, icon: Icon }) => <div className={`sidebar-nav-row ${page === item ? 'active' : ''}`} key={item}><button className={`nav-link ${page === item ? 'active' : ''}`} onClick={() => onNavigate(item)} aria-current={page === item ? 'page' : undefined}><Icon size={17} strokeWidth={1.5} /><span>{PAGE_LABELS[item]}</span>{item === 'macros' && <span className="nav-count">{macroCount}</span>}{item === 'groups' && <span className="nav-count">{groups.length}</span>}</button>{item === 'groups' && <button className="sidebar-nav-add" title="Новая группа" aria-label="Новая группа" onClick={onCreateGroup}><Plus size={13} /></button>}</div>)}</nav>
        <section className="sidebar-v2-section"><div className="sidebar-v2-label"><button onClick={() => setGroupsOpen(!groupsOpen)} aria-expanded={groupsOpen}>МОИ ГРУППЫ<ChevronDown size={10} className={groupsOpen ? '' : 'rotated'} /></button><button className="sidebar-label-action" title="Добавить группу" aria-label="Добавить группу" onClick={onCreateGroup}><Plus size={12} /></button></div>{groupsOpen && <nav className="group-nav sidebar-groups-v2">{groups.map((group) => <button className={`sidebar-group ${page === 'groups' && group.id === selectedGroupId ? 'active' : ''}`} key={group.id} onClick={() => onNavigate('groups', group.id)}><DepthIcon kind="folder" size={18} style={{ color: group.color }} /><span>{group.name}</span><span className="group-sidebar-count">{group.macroIds.length}</span></button>)}{!groups.length && <button className="sidebar-empty-link" onClick={onCreateGroup}>Создать первую группу<Plus size={12} /></button>}</nav>}</section>
        <section className="sidebar-v2-section config-sidebar-section"><div className="sidebar-v2-label"><button onClick={() => setConfigsOpen(!configsOpen)} aria-expanded={configsOpen}>МОИ КОНФИГИ<ChevronDown size={10} className={configsOpen ? '' : 'rotated'} /></button><button className="sidebar-label-action" title="Все конфиги" aria-label="Все конфигурации" onClick={onConfigs}><Ellipsis size={13} /></button></div>{configsOpen && <div className="sidebar-configs">{configs.slice(0, 3).map((item) => <button key={item.id} className="sidebar-config-link" onClick={onConfigs}><span className={`sidebar-file-icon ${item.source === 'backup' ? 'backup' : ''}`}><DepthIcon kind="config" size={20} /></span><span>{item.config.name}</span>{activeConfigId === item.id && <i className="sidebar-config-active" title="Текущий конфиг" />}</button>)}<button className="sidebar-save-config" onClick={onSaveConfig}><Plus size={12} />Сохранить текущий</button></div>}</section>
      </div>
      <div className="sidebar-v2-footer"><button className={`sidebar-footer-link ${page === 'profile' ? 'active' : ''}`} onClick={() => onNavigate('profile')}><UserRound size={16} strokeWidth={1.5} /><span>Мой профиль</span><ChevronDown size={11} className="profile-link-arrow" /></button><button className={`sidebar-footer-link ${page === 'settings' ? 'active' : ''}`} onClick={() => onNavigate('settings')}><Settings2 size={16} strokeWidth={1.5} /><span>Настройки</span></button><div className="sidebar-animation-toggle"><Sparkles size={15} strokeWidth={1.5} /><span>Плавные анимации</span><Toggle checked={settings.animations} onChange={onAnimations} label="Плавные анимации интерфейса" /></div><button
          className="sidebar-theme-toggle"
          aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            onTheme(theme === 'dark' ? 'light' : 'dark', { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
          }}
        >
          <span className="theme-toggle-track" data-theme-icon={theme} aria-hidden="true">
            <Sun size={10} strokeWidth={2} className="theme-icon-sun" />
            <Moon size={10} strokeWidth={2} className="theme-icon-moon" />
            <i className="theme-toggle-knob" />
          </span>
          <span className="theme-toggle-label">{theme === 'dark' ? 'Тёмная тема' : 'Светлая тема'}</span>
        </button></div>
    </aside>
  </>;
}