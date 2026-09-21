import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Bell, Check, CheckCheck, ChevronDown, ChevronRight, Clock3, CloudCheck, Download, Folder, Gauge, House, Info, Keyboard, Layers, LayoutGrid, List, Menu, Pause, Pencil, Play, Plus, ScrollText, Search, Share2, ShieldCheck, SlidersHorizontal, Trash2, TriangleAlert, X } from 'lucide-react';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, INITIAL_GROUPS, INITIAL_MACROS, PAGE_LABELS, downloadFile, formatElapsed, formatTime, initialEvents, isProfile, macroWord, normalizeProfile, uid, type ActivityEvent, type EventType, type Macro, type MacroGroup, type Page, type Profile, type Settings } from './data';
import { ActivityList, BrandMark, Breadcrumb, EmptyState, GroupCard, IconButton, MacroIcon, MacroTable, Modal, SectionLink } from './components/UI';
import { ActivityChart, GroupEditor, HelpContent, SearchDialog, ShareDialog, UpdatesContent } from './components/WorkspaceViews';
import { MacroEditor } from './components/MacroEditor';
import { DepthIcon } from './components/DepthIcon';
import { WindowControls, WindowStandby } from './components/WindowControls';
import { useWorkspaceWindow } from './hooks/useWorkspaceWindow';
import { Sidebar } from './components/Sidebar';
import { ProfilePopup, ProfilePopupHost } from './components/ProfilePopup';
import { SettingsPage } from './components/SettingsPage';
import { ProfilePage } from './components/ProfilePage';
import { ImportConfigDialog, SaveConfigDialog } from './components/ConfigDialogs';
import { INITIAL_CONFIGS, MAX_CONFIGS, configFilename, configFingerprint, isSavedConfigList, makeConfig, normalizeConfig, uniqueConfigName, type SavedConfig, type SettingsTab, type WorkspaceConfig } from './utils/config';
import { getAutomation, normalizeAutomation } from './macros/automation';
import { advanceRuntime, createRuntime, type MacroPhase, type MacroRuntime } from './macros/runtime';
import { BRAND_NAME } from './brand';
import { CosmicAccent, PanelFrame } from './components/Ornaments';
import { assetUrl } from './paths';
import { changePassword, fetchSnapshot, pushSnapshot, signOut as supabaseSignOut, type CloudAccount, type CloudSnapshot } from './lib/supabase';
import { ensureMyProfile, fetchMyProfile, syncMyProfile, type CommunityConfig, type CommunityProfile } from './lib/community';

export interface AppProps {
  /** Signed-in Supabase account; null in guest mode. */
  account: CloudAccount | null;
  isGuest: boolean;
  onSignOut: () => void;
}

type Dialog =
  | { type: 'search' }
  | { type: 'group'; group?: MacroGroup }
  | { type: 'macro'; macro?: Macro; groupId?: string }
  | { type: 'share' }
  | { type: 'help' }
  | { type: 'updates' }
  | { type: 'config-save' }
  | { type: 'config-import' }
  | { type: 'config-rename'; config: SavedConfig }
  | { type: 'confirm'; title: string; description: string; action: () => void; button?: string; tone?: 'primary' | 'danger' };

function useStoredState<T,>(key: string, fallback: T, validate: (value: unknown) => boolean) {
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [value, setValue] = useState<T>(() => {
    // Keep the previous namespace as a migration source, never as a reset trigger.
    for (const candidate of [key, key.replace(/^delkol\./, 'nte.')]) {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(candidate) ?? 'null');
        if (!validate(saved)) continue;
        if (key === 'delkol.profile.v1') {
          const migrated = normalizeProfile(saved);
          if (migrated) return migrated as T;
          continue;
        }
        return saved as T;
      } catch { continue; }
    }
    return fallback;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }, [key, value]);
  return [value, setValue, storageAvailable] as const;
}

function readRoute(): { page: Page; group: string | null } {
  const [page, group] = window.location.hash.replace('#', '').split('/');
  return { page: Object.prototype.hasOwnProperty.call(PAGE_LABELS, page) ? page as Page : 'overview', group: page === 'groups' && group ? group : null };
}

export default function App({ account, isGuest, onSignOut }: AppProps) {
  const [macros, setMacros, macrosStored] = useStoredState('delkol.macros.v1', INITIAL_MACROS, (value) => Array.isArray(value) && value.every((m) => m && typeof m.id === 'string' && typeof m.name === 'string' && typeof m.description === 'string' && typeof m.enabled === 'boolean' && ['fishing', 'racing', 'cafe', 'quests', 'artifacts'].includes(m.kind) && Number.isInteger(m.cycles) && m.cycles >= 0 && Number.isInteger(m.delay) && m.delay >= 1 && m.delay <= 60 && Number.isInteger(m.repeats) && m.repeats >= 0));
  const [groups, setGroups, groupsStored] = useStoredState('delkol.groups.v1', INITIAL_GROUPS, (value) => Array.isArray(value) && value.every((g) => g && typeof g.id === 'string' && typeof g.name === 'string' && typeof g.description === 'string' && typeof g.color === 'string' && /^#[0-9a-f]{6}$/i.test(g.color) && Array.isArray(g.macroIds) && g.macroIds.every((id: unknown) => typeof id === 'string')));
  const [settingsRaw, setSettings, settingsStored] = useStoredState<Settings>('delkol.settings.v1', DEFAULT_SETTINGS, (value) => !!value && typeof value === 'object' && 'name' in value && typeof value.name === 'string' && value.name.trim().length > 0 && 'shortcut' in value && ['F6', 'F8', 'F9'].includes(String(value.shortcut)) && ['animations', 'compact', 'notifications'].every((key) => typeof (value as Record<string, unknown>)[key] === 'boolean'));
  // Older saves predate the theme preference — fill it instead of resetting settings.
  const settings: Settings = { ...DEFAULT_SETTINGS, ...settingsRaw, theme: settingsRaw.theme === 'light' ? 'light' : 'dark' };
  const [profile, setProfile, profileStored] = useStoredState<Profile>('delkol.profile.v1', DEFAULT_PROFILE, isProfile);
  const [configs, setConfigs, configsStored] = useStoredState<SavedConfig[]>('delkol.configs.v1', INITIAL_CONFIGS, isSavedConfigList);
  const [activeConfigId, setActiveConfigId, activeConfigStored] = useStoredState('delkol.active-config.v1', 'default', (value) => typeof value === 'string' && value.length <= 80);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('configs');
  const [hudOn, setHudOn] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const profileDirtyRef = useRef(false);
  const [events, setEvents] = useState<ActivityEvent[]>(initialEvents);
  const [page, setPage] = useState<Page>(readRoute().page);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(readRoute().group);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessionCycles, setSessionCycles] = useState(0);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupMenu, setGroupMenu] = useState<string | null>(null);
  const [headerMenu, setHeaderMenu] = useState<'notifications' | 'period' | null>(null);
  const [period, setPeriod] = useState('Текущая сессия');
  const [notificationSeen, setNotificationSeen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [profilePopup, setProfilePopup] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<{ id: string; text: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const [communityProfile, setCommunityProfile] = useState<CommunityProfile | null>(null);
  const [macroSearch, setMacroSearch] = useState('');
  const [macroFilter, setMacroFilter] = useState('all');
  const [macroView, setMacroView] = useState<'list' | 'grid'>('list');
  const [groupSearch, setGroupSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [logFilter, setLogFilter] = useState('all');
  const [statsRange, setStatsRange] = useState('7');
  const [macroPhases, setMacroPhases] = useState<Record<string, MacroPhase>>({});
  const mainRef = useRef<HTMLElement>(null);
  const macrosRef = useRef(macros);
  const groupsRef = useRef(groups);
  const settingsRef = useRef(settings);
  const profileRef = useRef(profile);
  const ticksRef = useRef(0);
  const runtimeRef = useRef<Record<string, MacroRuntime>>({});
  macrosRef.current = macros;
  groupsRef.current = groups;
  settingsRef.current = settings;
  profileRef.current = profile;

  const enabledCount = macros.filter((macro) => macro.enabled).length;
  const storageHealthy = macrosStored && groupsStored && settingsStored && profileStored && configsStored && activeConfigStored;
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  // Notifications appear as real OS popups above everything in the bottom-right
  // corner (electron/notifications.cjs) — they never steal focus and hover
  // pauses their timer. The in-app toast below stays as the plain-web fallback.
  const notify = useCallback((text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    if (window.delkol?.notify) { void window.delkol.notify(text, type); return; }
    setToast({ id: uid(), text, type });
  }, []);
  const workspaceWindow = useWorkspaceWindow(notify);
  const addEvent = useCallback((title: string, detail = '', type: EventType = 'info') => {
    setEvents((previous) => [{ id: uid(), title, detail, time: Date.now(), type }, ...previous].slice(0, 200));
    setNotificationSeen(false);
  }, []);

  // --------------------------- Supabase cloud sync ---------------------------
  const [cloudStatus, setCloudStatus] = useState<'offline' | 'syncing' | 'online' | 'error'>(account ? 'online' : 'offline');
  const [cloudPush, setCloudPush] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const pullDoneRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const skipNextPushRef = useRef(false);
  const lastSyncedFingerprint = useRef('');

  const cloudFail = useCallback((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : 'Ошибка синхронизации';
    setCloudStatus('error');
    setCloudError(message);
    addEvent('Облако недоступно', message, 'warning');
    notify('Не удалось синхронизироваться с облаком. Данные сохранены локально.', 'warning');
  }, [addEvent, notify]);

  /** Pull the cloud snapshot; fall back to local data when empty. Reused by the login effect and the manual "Повторить" button. */
  const pullCloud = useCallback((current: CloudAccount) => {
    let alive = true;
    pullDoneRef.current = false;
    setCloudStatus('syncing');
    void (async () => {
      try {
        const snapshot = await fetchSnapshot(current.id);
        if (!alive) return;
        if (snapshot) {
          const remote = snapshot as Partial<CloudSnapshot>;
          if (remote.profile && isProfile(remote.profile)) setProfile(normalizeProfile(remote.profile) ?? remote.profile);
          if (Array.isArray(remote.macros)) setMacros(remote.macros);
          if (Array.isArray(remote.groups)) setGroups(remote.groups);
          if (remote.settings) setSettings((previous) => ({ ...previous, ...remote.settings, name: previous.name } as Settings));
          skipNextPushRef.current = true;
          lastSyncedFingerprint.current = JSON.stringify([remote.macros, remote.groups, remote.settings]);
          addEvent('Данные загружены из облака', `Аккаунт ${current.email}`, 'success');
          if (settingsRef.current.notifications) notify('Ваше пространство синхронизировано с облаком.');
        } else {
          // First login: seed the cloud with current local workspace + profile.
          await pushSnapshot(current.id, { macros: macrosRef.current, groups: groupsRef.current, settings: settingsRef.current, profile: profileRef.current });
          lastSyncedFingerprint.current = JSON.stringify([macrosRef.current, groupsRef.current, settingsRef.current]);
          addEvent('Рабочее пространство сохранено в облако', `Аккаунт ${current.email}`, 'success');
        }
        if (alive) { setCloudStatus('online'); setCloudError(null); }
      } catch (cause) {
        if (!alive) return;
        cloudFail(cause);
      } finally {
        if (alive) pullDoneRef.current = true;
      }
    })();
    return () => { alive = false; };
  }, [addEvent, notify, cloudFail]);

  // Pull the cloud snapshot once after login.
  useEffect(() => {
    if (!account) { setCloudStatus('offline'); setCloudError(null); pullDoneRef.current = true; return; }
    return pullCloud(account);
  }, [account, pullCloud]);

  /** Push the current workspace to the cloud (used by autosave, auto-retry and the manual button). */
  const pushNow = useCallback((): Promise<boolean> => {
    if (!account || !pullDoneRef.current) return Promise.resolve(false);
    const fingerprint = JSON.stringify([macrosRef.current, groupsRef.current, settingsRef.current]);
    if (fingerprint === lastSyncedFingerprint.current) return Promise.resolve(true);
    setCloudPush(true);
    return pushSnapshot(account.id, { macros: macrosRef.current, groups: groupsRef.current, settings: settingsRef.current, profile: profileRef.current })
      .then(() => { lastSyncedFingerprint.current = fingerprint; setCloudStatus('online'); setCloudError(null); return true; })
      .catch((cause: unknown) => { cloudFail(cause); return false; })
      .finally(() => setCloudPush(false));
  }, [account, cloudFail]);

  // Debounced push: any workspace change uploads a snapshot ~1.2s later.
  useEffect(() => {
    if (!account || !pullDoneRef.current) return;
    if (skipNextPushRef.current) { skipNextPushRef.current = false; return; }
    const fingerprint = JSON.stringify([macros, groups, settings]);
    if (fingerprint === lastSyncedFingerprint.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => { void pushNow(); }, 1200);
    return () => { if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current); };
  }, [account, macros, groups, settings, pushNow]);

  // While the cloud is unreachable, keep retrying every 20s until it recovers.
  useEffect(() => {
    if (!account || cloudStatus !== 'error') return;
    const timer = window.setInterval(() => { void pushNow(); }, 20_000);
    return () => window.clearInterval(timer);
  }, [account, cloudStatus, pushNow]);

  const retryCloudSync = useCallback(() => {
    if (!account) return;
    setCloudError(null);
    pullCloud(account);
  }, [account, pullCloud]);

  const handleSignOut = useCallback(() => {
    setDialog({
      type: 'confirm',
      title: 'Выйти из аккаунта?',
      description: 'Синхронизация остановится. Локальные данные останутся на этом устройстве, облачная копия — в вашем аккаунте.',
      button: 'Выйти',
      action: () => {
        void supabaseSignOut().finally(() => onSignOut());
      },
    });
  }, [onSignOut]);

  const handleChangePassword = useCallback(async (newPassword: string): Promise<boolean> => {
    try {
      await changePassword(newPassword);
      addEvent('Пароль обновлён', 'Пароль аккаунта изменён', 'success');
      notify('Пароль аккаунта обновлён.');
      return true;
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Не удалось изменить пароль.', 'warning');
      return false;
    }
  }, [addEvent, notify]);
  // -------------------------------------------------------------------------

  const navigate = useCallback((nextPage: Page, groupId: string | null = null, afterNavigate?: () => void) => {
    const go = () => {
      if (nextPage !== 'profile') { profileDirtyRef.current = false; setProfileDirty(false); }
      setPage(nextPage); setSelectedGroupId(groupId);
      window.location.hash = groupId ? `${nextPage}/${groupId}` : nextPage;
      setMobileSidebar(false); setHeaderMenu(null); setGroupMenu(null);
      mainRef.current?.scrollTo({ top: 0 });
      afterNavigate?.();
    };
    if (profileDirtyRef.current && nextPage !== 'profile') {
      setDialog({ type: 'confirm', title: 'Выйти без сохранения?', description: 'В профиле есть несохранённые изменения. Сохраните их или подтвердите переход без сохранения.', button: 'Не сохранять', action: go });
    } else go();
  }, []);

  const onProfileDirtyChange = useCallback((dirty: boolean) => { profileDirtyRef.current = dirty; setProfileDirty(dirty); }, []);
  const openProfilePopup = useCallback((point: { x: number; y: number }) => { setProfilePopup(point); setMobileSidebar(false); }, []);
  const openProfilePage = useCallback(() => { setProfilePopup(null); navigate('profile'); }, [navigate]);
  const openShopFromPopup = useCallback(() => { setProfilePopup(null); setSettingsTab('shop'); navigate('settings'); }, [navigate]);
  const openConfigs = () => { setSettingsTab('configs'); navigate('settings'); };

  useEffect(() => {
    const listener = () => {
      const route = readRoute();
      if (profileDirtyRef.current && route.page !== 'profile') {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#profile`);
        navigate(route.page, route.group);
      } else { setPage(route.page); setSelectedGroupId(route.group); }
    };
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, [navigate]);
  useEffect(() => { document.title = `${selectedGroup?.name ?? PAGE_LABELS[page]} | ${BRAND_NAME}`; }, [page, selectedGroup?.name]);

  // --------------------------- Theme (dark / light) ---------------------------
  // Toggles `data-theme` on <html>; CSS custom properties do the rest. When the
  // browser supports View Transitions we animate a soft radial wipe from the
  // toggle; otherwise the CSS color transitions make the switch still smooth.
  useEffect(() => {
    const root = document.documentElement;
    const theme = settings.theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }, [settings.theme]);
  const changeTheme = useCallback((next: 'dark' | 'light', origin?: { x: number; y: number }) => {
    const apply = () => setSettings((previous) => ({ ...previous, theme: next }));
    const root = document.documentElement;
    const nav = document as Document & { startViewTransition?: (update: () => void) => unknown };
    if (!nav.startViewTransition || !settings.animations) { apply(); return; }
    const x = origin?.x ?? window.innerWidth - 80;
    const y = origin?.y ?? 40;
    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = nav.startViewTransition(() => { flushSync(apply); });
    const ready = (transition as { ready?: Promise<void> }).ready;
    ready?.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
        { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => undefined);
  }, [settings.animations]);
  useEffect(() => {
    if (!storageHealthy) notify('Браузер ограничил сохранение. Экспортируйте настройки, прежде чем закрыть вкладку.', 'warning');
  }, [storageHealthy, notify]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const toggleSession = useCallback(() => {
    if (running) {
      setRunning(false);
      addEvent('Сессия приостановлена', `Время работы: ${formatElapsed(elapsed)}`);
      if (settings.notifications) notify('Сессия на паузе. Продолжите, когда будете готовы.', 'info');
      return;
    }
    const activeCount = macrosRef.current.filter((macro) => macro.enabled).length;
    if (!activeCount) { notify('Сначала включите хотя бы один макрос.', 'warning'); navigate('macros'); return; }
    setRunning(true);
    addEvent(elapsed ? 'Сессия продолжена' : 'Демо-сессия запущена', `${activeCount} ${macroWord(activeCount)} в работе`, 'success');
    if (settings.notifications) notify(elapsed ? 'Вернулись в ритм. Сессия продолжена.' : 'Демо-сессия запущена. Всё под контролем.');
  }, [running, elapsed, settings.notifications, notify, addEvent, navigate]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (workspaceWindow.state !== 'open') return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && dialog?.type !== 'macro') { event.preventDefault(); setDialog((previous) => previous?.type === 'search' ? null : { type: 'search' }); }
      if (event.key === settings.shortcut && !dialog) { event.preventDefault(); toggleSession(); }
      if (event.key === 'Escape') { setHeaderMenu(null); setGroupMenu(null); setMobileSidebar(false); }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [toggleSession, dialog, settings.shortcut, workspaceWindow.state]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      ticksRef.current += 1;
      setElapsed((previous) => previous + 1);
      const completed: string[] = [];
      const finished: string[] = [];
      const phases: Record<string, MacroPhase> = {};
      macrosRef.current.filter((macro) => macro.enabled).forEach((macro) => {
        const result = advanceRuntime(macro, runtimeRef.current[macro.id] ?? createRuntime(macro), 1, document.hidden);
        runtimeRef.current[macro.id] = result.runtime;
        phases[macro.id] = result.runtime.phase;
        if (result.completed) completed.push(macro.id);
        if (result.stopReason) finished.push(macro.id);
        if (result.event) addEvent(result.event.title, result.event.detail, result.event.type);
        const notifications = getAutomation(macro).execution.notifications;
        if (settingsRef.current.notifications && notifications !== 'silent') {
          if (result.stopReason) notify(`${macro.name}: ${result.stopReason}`, result.event?.type === 'warning' ? 'warning' : 'info');
          else if (notifications === 'all' && (result.completed || result.event)) notify(`${macro.name}: ${result.event?.detail ?? result.runtime.lastDetail}`, result.event?.type === 'warning' ? 'warning' : 'success');
        }
      });
      setMacroPhases(phases);
      if (completed.length || finished.length) setMacros((previous) => previous.map((macro) => ({ ...macro, cycles: completed.includes(macro.id) ? Math.min(Number.MAX_SAFE_INTEGER, macro.cycles + 1) : macro.cycles, enabled: finished.includes(macro.id) ? false : macro.enabled })));
      if (completed.length) setSessionCycles((previous) => previous + completed.length);
    }, 1000);
    return () => clearInterval(timer);
  }, [running, addEvent, setMacros, notify]);

  useEffect(() => {
    if (running && enabledCount === 0) { setRunning(false); addEvent('Сессия завершена', 'Нет активных макросов', 'success'); notify('Все макросы остановлены. Сессия завершена.', 'info'); }
  }, [running, enabledCount, addEvent, notify]);

  // ---------------------- Внешний HUD (отдельное окно) ----------------------
  // Пушим состояние активных макросов в HUD-пилюлю за краем окна каждый тик.
  // Для каждого макроса считаем его первую группу — HUD показывает её цвет меткой.
  useEffect(() => {
    const push = window.delkol?.hudPushState;
    if (!push) return;
    const groupOf = (macroId: string) => groups.find((group) => group.macroIds.includes(macroId));
    const hudMacros = macros.filter((macro) => running && macro.enabled).map((macro) => {
      const phase = macroPhases[macro.id] ?? 'running';
      const percent = ((macro.cycles % 10) / 10) * 100 + (phase === 'running' ? 12 : phase === 'waiting' ? 4 : 22);
      const group = groupOf(macro.id);
      return { id: macro.id, name: macro.name, kind: macro.kind, percent: percent % 100, phase, group: group ? group.name : '', groupColor: group ? group.color : '' };
    });
    push({ macros: hudMacros, session: { running, elapsed, cycles: sessionCycles } });
  }, [running, macros, macroPhases, groups, elapsed, sessionCycles]);

  // Шестерёнка в HUD открывает настройки приложения.
  useEffect(() => {
    const off = window.delkol?.onHudOpenSettings?.(() => { setSettingsTab('configs'); navigate('settings'); });
    return () => off?.();
  }, [navigate]);

  // Начальное состояние внешней HUD-пилюли.
  useEffect(() => {
    void window.delkol?.hudGetEnabled?.().then((enabled) => setHudOn(!!enabled)).catch(() => undefined);
  }, []);
  const toggleHud = useCallback(() => {
    const next = !hudOn;
    setHudOn(next);
    void window.delkol?.hudSetEnabled?.(next)?.then((applied) => setHudOn(!!applied)).catch(() => undefined);
    addEvent(next ? 'HUD включён' : 'HUD выключен', next ? 'Пилюля макросов закреплена за краем окна' : 'Пилюля макросов скрыта');
  }, [hudOn, addEvent]);

  const toggleMacro = (id: string) => {
    const macro = macros.find((item) => item.id === id);
    if (!macro) return;
    delete runtimeRef.current[id];
    setMacros((previous) => previous.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item));
    addEvent(`Макрос «${macro.name}» ${macro.enabled ? 'выключен' : 'включён'}`, macro.enabled ? 'Исключён из следующего запуска' : 'Готов к следующему запуску');
  };

  const runGroup = (group: MacroGroup) => {
    setGroupMenu(null);
    const ids = group.macroIds.filter((id) => macros.some((macro) => macro.id === id));
    if (!ids.length) { notify('Добавьте макросы в группу перед запуском.', 'warning'); setDialog({ type: 'group', group }); return; }
    runtimeRef.current = {}; ticksRef.current = 0; setMacroPhases({});
    setElapsed(0); setSessionCycles(0);
    setMacros((previous) => previous.map((macro) => ({ ...macro, enabled: ids.includes(macro.id) })));
    setActiveGroupId(group.id); setRunning(true);
    addEvent(`Группа «${group.name}» запущена`, `${ids.length} ${macroWord(ids.length)} в демо-сессии`, 'success');
    notify(`Группа «${group.name}» запущена. Активных макросов: ${ids.length}.`);
  };

  const saveGroup = (group: MacroGroup) => {
    const exists = groups.some((item) => item.id === group.id);
    if (!exists && groups.length >= 100) { notify('В пространстве можно создать до 100 групп.', 'warning'); return; }
    setGroups((previous) => exists ? previous.map((item) => item.id === group.id ? group : item) : [...previous, group]);
    setDialog(null);
    addEvent(`Группа «${group.name}» ${exists ? 'обновлена' : 'создана'}`, `${group.macroIds.length} ${macroWord(group.macroIds.length)}`, 'success');
    notify(exists ? 'Изменения группы сохранены.' : 'Новая группа готова. Всё на своих местах.');
  };

  const deleteGroup = (group: MacroGroup) => {
    setGroupMenu(null);
    setDialog({ type: 'confirm', title: `Удалить группу «${group.name}»?`, description: 'Макросы останутся в вашем пространстве. Удалится только группа.', action: () => {
      setGroups((previous) => previous.filter((item) => item.id !== group.id));
      if (selectedGroupId === group.id) navigate('groups');
      if (activeGroupId === group.id) setActiveGroupId(null);
      addEvent(`Группа «${group.name}» удалена`); notify('Группа удалена. Макросы сохранены.');
    } });
  };

  const saveMacro = (macro: Macro, groupId?: string) => {
    const exists = macros.some((item) => item.id === macro.id);
    if (!exists && macros.length >= 200) { notify('В пространстве можно создать до 200 макросов.', 'warning'); return; }
    let validated: Macro;
    try { validated = { ...macro, automation: normalizeAutomation(macro.kind, macro.automation) }; }
    catch (cause) { notify(cause instanceof Error ? cause.message : 'Проверьте настройки макроса.', 'warning'); return; }
    setMacros((previous) => exists ? previous.map((item) => item.id === macro.id ? { ...validated, cycles: item.cycles } : item) : [...previous, validated]);
    if (groupId) setGroups((previous) => previous.map((group) => group.id === groupId && !group.macroIds.includes(macro.id) ? { ...group, macroIds: [...group.macroIds, macro.id] } : group));
    delete runtimeRef.current[macro.id]; setDialog(null);
    addEvent(`Макрос «${macro.name}» ${exists ? 'настроен' : 'добавлен'}`, `Интервал: ${macro.delay} сек.`, 'success');
    notify(exists ? 'Настройки макроса сохранены.' : 'Макрос добавлен в ваше пространство.');
  };

  const deleteMacro = (macro: Macro) => {
    setMacros((previous) => previous.filter((item) => item.id !== macro.id));
    setGroups((previous) => previous.map((group) => ({ ...group, macroIds: group.macroIds.filter((id) => id !== macro.id) })));
    delete runtimeRef.current[macro.id]; setDialog(null);
    addEvent(`Макрос «${macro.name}» удалён`); notify('Макрос удалён.');
  };

  const snapshot = (name: string, description = '') => makeConfig(name, description, macrosRef.current, groupsRef.current, settingsRef.current);
  const downloadConfig = (config: WorkspaceConfig) => downloadFile(configFilename(config.name), JSON.stringify(config, null, 2));
  const commitConfigs = (next: SavedConfig[]): boolean => {
    try {
      localStorage.setItem('delkol.configs.v1', JSON.stringify(next));
      setConfigs(next);
      return true;
    } catch {
      notify('Не удалось сохранить библиотеку. Проверьте доступ к хранилищу или удалите ненужные конфиги.', 'warning');
      return false;
    }
  };
  const exportWorkspace = () => {
    const active = configs.find((item) => item.id === activeConfigId);
    downloadConfig(snapshot(active?.config.name ?? BRAND_NAME, active?.config.description ?? 'Текущее рабочее пространство'));
    notify('Текущая конфигурация экспортирована в JSON.'); setHeaderMenu(null);
  };
  const saveCurrentConfig = (name: string, description: string, download: boolean) => {
    if (configs.length >= MAX_CONFIGS) { notify(`В библиотеке уже ${MAX_CONFIGS} конфигов. Удалите ненужный перед сохранением.`, 'warning'); return; }
    const saved: SavedConfig = { id: uid(), savedAt: Date.now(), source: 'local', config: snapshot(name, description) };
    if (!commitConfigs([saved, ...configs])) {
      if (download) { downloadConfig(saved.config); notify('JSON-файл скачан, но браузер не разрешил сохранить конфиг в библиотеку.', 'warning'); }
      return;
    }
    setActiveConfigId(saved.id);
    if (download) downloadConfig(saved.config);
    addEvent(`Конфиг «${name}» сохранён`, `${saved.config.macros.length} ${macroWord(saved.config.macros.length)} / ${saved.config.groups.length} групп`, 'success');
    setDialog(null); notify(download ? 'Конфиг сохранён в библиотеку. JSON-файл скачан.' : 'Конфиг сохранён в вашу библиотеку.');
  };
  const applyConfiguration = (saved: SavedConfig, imported = false): boolean => {
    let config: WorkspaceConfig;
    try { config = normalizeConfig(saved.config); }
    catch (cause) { notify(cause instanceof Error ? cause.message : 'Не удалось проверить конфиг.', 'warning'); return false; }
    const needsBackup = configFingerprint(macrosRef.current, groupsRef.current, settingsRef.current) !== configFingerprint(config.macros, config.groups, config.settings);
    if (configs.length + Number(needsBackup) + Number(imported) > MAX_CONFIGS) { notify('Освободите место в библиотеке для конфига и резервной копии.', 'warning'); return false; }
    const backup: SavedConfig | null = needsBackup ? {
      id: uid(), savedAt: Date.now(), source: 'backup',
      config: snapshot(uniqueConfigName('Резервная копия', imported ? [saved, ...configs] : configs), `Перед применением: ${config.name}`),
    } : null;
    if ((imported || backup) && !commitConfigs([...(imported ? [{ ...saved, config }] : []), ...(backup ? [backup] : []), ...configs])) return false;
    setRunning(false); setElapsed(0); setSessionCycles(0); ticksRef.current = 0; runtimeRef.current = {}; setMacroPhases({});
    setMacros(config.macros); setGroups(config.groups);
    setSettings((previous) => ({ ...previous, ...config.settings, name: previous.name }));
    setActiveConfigId(saved.id); setActiveGroupId(null); setSelectedGroupId(null);
    addEvent(`Конфиг «${config.name}» применён`, backup ? 'Предыдущее состояние сохранено в резервную копию' : 'Сессия приостановлена, настройки загружены', 'success');
    notify(backup ? 'Конфиг применён. Резервная копия сохранена.' : 'Конфиг применён. Можно начинать новую сессию.');
    return true;
  };
  const requestApplyConfig = (saved: SavedConfig) => {
    if (saved.id === activeConfigId && configFingerprint(macros, groups, settings) === configFingerprint(saved.config.macros, saved.config.groups, saved.config.settings)) { notify('Этот конфиг уже используется.', 'info'); return; }
    setDialog({ type: 'confirm', title: `Применить «${saved.config.name}»?`, description: 'Текущая сессия остановится. Макросы, группы и настройки будут заменены. Перед заменой сохраним резервную копию; личный профиль не изменится.', button: 'Применить конфиг', tone: 'primary', action: () => { applyConfiguration(saved); } });
  };
  const importConfiguration = (config: WorkspaceConfig, apply: boolean) => {
    if (configs.length >= MAX_CONFIGS) { notify(`Библиотека заполнена. Можно хранить до ${MAX_CONFIGS} конфигов.`, 'warning'); return; }
    const saved: SavedConfig = { id: uid(), savedAt: Date.now(), source: 'import', config };
    if (apply) { if (!applyConfiguration(saved, true)) return; }
    else { if (!commitConfigs([saved, ...configs])) return; notify(`Конфиг «${config.name}» добавлен в библиотеку.`); }
    addEvent(`Конфиг «${config.name}» импортирован`, `${config.macros.length} ${macroWord(config.macros.length)} / JSON v1`, 'success');
    setDialog(null);
  };
  const renameConfiguration = (saved: SavedConfig, name: string, description: string) => {
    if (!commitConfigs(configs.map((item) => item.id === saved.id ? { ...item, config: { ...item.config, name, description } } : item))) return;
    addEvent(`Конфиг переименован в «${name}»`); setDialog(null); notify('Название и описание сохранены.');
  };
  const updateConfiguration = (saved: SavedConfig) => setDialog({ type: 'confirm', title: `Обновить «${saved.config.name}»?`, description: 'Сохранённое содержимое этого конфига будет заменено текущими макросами, группами и настройками. Другие конфиги останутся без изменений.', button: 'Обновить конфиг', tone: 'primary', action: () => {
    const config = snapshot(saved.config.name, saved.config.description);
    if (!commitConfigs(configs.map((item) => item.id === saved.id ? { ...item, savedAt: Date.now(), source: 'local' as const, config } : item))) return;
    setActiveConfigId(saved.id); addEvent(`Конфиг «${config.name}» обновлён`, 'Сохранено текущее состояние пространства', 'success'); notify('Конфиг обновлён текущими настройками.');
  } });
  const deleteConfiguration = (saved: SavedConfig) => setDialog({ type: 'confirm', title: `Удалить «${saved.config.name}»?`, description: 'Удалится только сохранённый конфиг из библиотеки. Текущие макросы, группы и скачанные JSON-файлы останутся.', action: () => {
    if (!commitConfigs(configs.filter((item) => item.id !== saved.id))) return;
    if (activeConfigId === saved.id) setActiveConfigId('');
    addEvent(`Конфиг «${saved.config.name}» удалён`); notify('Конфиг удалён из библиотеки.');
  } });
  const saveProfile = (updated: Profile, name: string) => {
    if (!isProfile(updated)) { notify('Проверьте данные профиля и попробуйте сохранить снова.', 'warning'); return; }
    setProfile(updated); setSettings((previous) => ({ ...previous, name })); onProfileDirtyChange(false);
    addEvent('Профиль обновлён', account ? `Профиль @${name} · синхронизирован` : `Локальный профиль @${name}`, 'success'); notify('Изменения профиля сохранены.');
    // Mirror handle / name / avatar into the public community profile.
    if (account) {
      void syncMyProfile(account, { handle: name, displayName: updated.displayName, avatar: updated.avatar })
        .then(() => fetchMyProfile(account))
        .then((fresh) => { if (fresh) setCommunityProfile(fresh); })
        .catch((cause: unknown) => notify(cause instanceof Error ? cause.message : 'Публичный профиль не обновлён.', 'warning'));
    }
  };

  // Ensure a public profile exists right after login; keeps coins/frames in sync.
  useEffect(() => {
    if (!account) { setCommunityProfile(null); return; }
    let alive = true;
    void ensureMyProfile(account, settingsRef.current.name, profileRef.current.displayName, profileRef.current.avatar)
      .then((fresh) => { if (alive) setCommunityProfile(fresh); })
      .catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  const applyCommunityConfig = useCallback((row: CommunityConfig) => {
    let config;
    try { config = normalizeConfig(row.config, row.name); }
    catch (cause) { notify(cause instanceof Error ? cause.message : 'Конфиг сообщества повреждён.', 'warning'); return; }
    const saved: SavedConfig = { id: uid(), savedAt: Date.now(), source: 'import', config };
    if (applyConfiguration(saved, true)) addEvent(`Конфиг «${config.name}» из топа применён`, `Автор: @${row.author?.handle ?? '—'}`, 'success');
  }, [notify]);

  const handleFrameChanged = useCallback((coins: number, owned: string[], equipped: string) => {
    setCommunityProfile((previous) => previous ? { ...previous, coins, ownedFrames: owned, frame: equipped } : previous);
    setProfile((previous) => ({ ...previous, frame: equipped as Profile['frame'] }));
  }, []);

  const exportLogs = () => { downloadFile('delkol-journal.txt', events.map((event) => `[${new Date(event.time).toLocaleString('ru-RU')}] ${event.title}${event.detail ? ` / ${event.detail}` : ''}`).join('\n'), 'text/plain;charset=utf-8'); notify('Журнал событий экспортирован.'); };
  const dismissMenus = () => { setHeaderMenu(null); setGroupMenu(null); setMobileSidebar(false); };
  const minimizeWindow = () => {
    dismissMenus();
    setToast(null);
    workspaceWindow.minimize();
  };
  const requestCloseWindow = () => {
    dismissMenus();
    setDialog({
      type: 'confirm',
      title: `Закрыть ${BRAND_NAME}?`,
      description: profileDirty
        ? 'Рабочее пространство закроется, а сессия остановится. В профиле есть несохранённые изменения: они останутся только в этой вкладке. Вернитесь и сохраните их перед выходом из браузера.'
        : storageHealthy
        ? 'Рабочее пространство закроется, а сессия будет приостановлена. Настройки сохранены. Вкладка останется открытой, чтобы вы могли вернуться.'
        : 'Сессия будет приостановлена. Автосохранение недоступно: данные останутся в этой вкладке. Не закрывайте её без экспорта настроек.',
      button: 'Закрыть пространство',
      action: () => {
        setRunning(false);
        setToast(null);
        addEvent('Рабочее пространство закрыто', 'Демо-сессия остановлена. Настройки не изменены.');
        workspaceWindow.close();
      },
    });
  };
  const filteredMacros = macros.filter((macro) => `${macro.name} ${macro.description}`.toLowerCase().includes(macroSearch.toLowerCase()) && (macroFilter === 'all' || (macroFilter === 'enabled' ? macro.enabled : !macro.enabled)));
  const filteredGroups = groups.filter((group) => `${group.name} ${group.description}`.toLowerCase().includes(groupSearch.toLowerCase()));
  const filteredLogs = events.filter((event) => (logFilter === 'all' || event.type === logFilter) && `${event.title} ${event.detail}`.toLowerCase().includes(logSearch.toLowerCase()));
  const visibleEvents = period === 'Сегодня' ? events.filter((event) => new Date(event.time).toDateString() === new Date().toDateString()) : events;
  const renderGroup = (group: MacroGroup) => <GroupCard key={group.id} group={group} macroCount={group.macroIds.filter((id) => macros.some((macro) => macro.id === id)).length} running={running && activeGroupId === group.id} menuOpen={groupMenu === group.id} onMenu={() => setGroupMenu((previous) => previous === group.id ? null : group.id)} onOpen={() => navigate('groups', group.id)} onEdit={() => { setGroupMenu(null); setDialog({ type: 'group', group }); }} onDelete={() => deleteGroup(group)} onRun={() => runGroup(group)} />;

  const periodPicker = <div className="period-picker"><button className="button button-secondary period-button" onClick={() => setHeaderMenu(headerMenu === 'period' ? null : 'period')} aria-expanded={headerMenu === 'period'}><Clock3 size={15} />{period}<ChevronDown size={13} /></button>{headerMenu === 'period' && <><button className="menu-dismiss" aria-label="Закрыть выбор периода" onClick={() => setHeaderMenu(null)} /><div className="dropdown period-dropdown">{['Текущая сессия', 'Сегодня', 'Последние 7 дней'].map((item) => <button key={item} onClick={() => { setPeriod(item); setHeaderMenu(null); }}>{item}{period === item && <Check size={14} />}</button>)}</div></>}</div>;

  return <MotionConfig reducedMotion={settings.animations ? 'user' : 'always'}>
    <div className={`workspace-desktop ${!settings.animations ? 'no-animation' : ''}`}>
    <div className={`app-shell app-open ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${settings.compact ? 'compact-mode' : ''} ${workspaceWindow.focusMode ? 'window-focus-mode' : ''} window-is-${workspaceWindow.state}`} inert={workspaceWindow.state !== 'open' || !!dialog} aria-hidden={workspaceWindow.state !== 'open' ? true : undefined}>
      <Sidebar
        page={page} profile={profile} settings={settings} groups={groups} configs={configs} activeConfigId={activeConfigId}
        selectedGroupId={selectedGroupId} macroCount={macros.length} unread={!notificationSeen && events.length > 0}
        collapsed={sidebarCollapsed} mobileOpen={mobileSidebar} focusMode={workspaceWindow.focusMode} onNavigate={navigate}
        onProfilePopup={openProfilePopup}
        onSearch={() => setDialog({ type: 'search' })}
        onNotifications={() => { setMobileSidebar(false); setHeaderMenu(headerMenu === 'notifications' ? null : 'notifications'); setNotificationSeen(true); }}
        onConfigs={openConfigs} onCreateGroup={() => setDialog({ type: 'group' })} onSaveConfig={() => setDialog({ type: 'config-save' })}
        onHelp={() => setDialog({ type: 'help' })} onUpdates={() => setDialog({ type: 'updates' })}
        onCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} onMobileClose={() => setMobileSidebar(false)}
        onAnimations={() => setSettings((previous) => ({ ...previous, animations: !previous.animations }))}
        theme={settings.theme} onTheme={(next, origin) => changeTheme(next, origin)}
      />

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <IconButton icon={Menu} label="Открыть навигацию" className="mobile-menu-button" onClick={() => setMobileSidebar(!mobileSidebar)} />
            <House size={15} className="breadcrumb-home" /><span className="breadcrumb-divider">/</span>
            <button className="breadcrumb-workspace" onClick={() => navigate('overview')}>Рабочее пространство</button>
            <Breadcrumb onClick={selectedGroup && page === 'groups' ? () => navigate('groups') : undefined}>{PAGE_LABELS[page]}</Breadcrumb>
            {selectedGroup && page === 'groups' && <Breadcrumb>{selectedGroup.name}</Breadcrumb>}
          </div>
          <div className="topbar-actions">
            <span className="saved-indicator" title={storageHealthy ? profileDirty ? 'Нажмите «Сохранить изменения» в профиле' : 'Изменения сохранены на этом устройстве' : 'Экспортируйте конфигурацию, чтобы не потерять изменения'}>
              {storageHealthy ? profileDirty ? <Pencil size={14} /> : <CloudCheck size={15} /> : <TriangleAlert size={15} />}
              {storageHealthy ? profileDirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены' : 'Сохранение недоступно'}
            </span>
            <span className="topbar-divider" />
            <div className="notification-wrap">
              <button className="icon-button notification-button" title="Уведомления" aria-label="Уведомления" aria-expanded={headerMenu === 'notifications'} onClick={() => { setHeaderMenu(headerMenu === 'notifications' ? null : 'notifications'); setNotificationSeen(true); }}><Bell size={17} strokeWidth={1.6} />{!notificationSeen && events.length > 0 && <i />}</button>
              {headerMenu === 'notifications' && <>
                <button className="menu-dismiss" aria-label="Закрыть уведомления" onClick={() => setHeaderMenu(null)} />
                <div className="dropdown notification-dropdown"><div className="notification-heading"><strong>Уведомления</strong><CheckCheck size={16} /></div><ActivityList events={events} limit={4} /><button className="notification-footer" onClick={() => navigate('logs')}>Все события<ArrowRight size={14} /></button></div>
              </>}
            </div>
            <button className="button button-secondary share-button" onClick={() => setDialog({ type: 'share' })}><Share2 size={14} /><span>Поделиться</span></button>
            <WindowControls maximized={workspaceWindow.isMaximized} busy={workspaceWindow.busy} onMinimize={minimizeWindow} onMaximize={() => { dismissMenus(); void workspaceWindow.toggleMaximize(); }} onClose={requestCloseWindow} />
          </div>
        </header>

        <div className="content-viewport">
        <main className="content-scroll" ref={mainRef}>
          <motion.div key={`${page}-${selectedGroupId ?? ''}`} className={`page-content page-${page}`} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
            {page === 'overview' && <>
              <div className="page-heading"><div><h1>Обзор<span className="heading-dot">.</span></h1><p>Всё под контролем. Просто наслаждайтесь игрой.</p></div>{periodPicker}</div>
              <section className={`welcome-banner ${running ? 'session-live' : ''}`} aria-label="Управление сессией"><img className="welcome-art" src={assetUrl('/images/hetero-city.jpg')} alt="Панорама Хетеро в мягком свете лиловых сумерек" /><div className="welcome-shade" /><PanelFrame className="banner-frame" /><div className="welcome-copy"><h2 className="delkol-wordmark"><BrandMark /><span>{BRAND_NAME}</span></h2><p>Меньше рутины. Больше вашей игры.</p><div className="welcome-actions"><button className={`button button-primary session-start-button ${running ? 'button-session-running' : ''}`} onClick={toggleSession}><CosmicAccent /><span className="session-button-content">{running ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}{running ? 'Приостановить' : elapsed ? 'Продолжить сессию' : 'Начать сессию'}<kbd>{settings.shortcut}</kbd></span></button><button className="button button-hero-ghost" onClick={() => navigate('settings')}><SlidersHorizontal size={15} />Настроить</button></div></div>{running && <div className="session-time"><span className="live-dot" />{formatElapsed(elapsed)}</div>}</section>
              <section className="overview-groups"><div className="section-heading"><h2>Мои группы<span className="section-count">{groups.length}</span></h2><button className="text-button new-group-button" onClick={() => setDialog({ type: 'group' })}><Plus size={15} />Новая группа</button></div>{groups.length > 0 ? <div className="group-grid overview-group-grid">{groups.slice(0, 3).map(renderGroup)}{groups.length > 3 && <button className="more-groups-link" onClick={() => navigate('groups')}>Ещё {groups.length - 3}<ArrowRight size={15} /></button>}</div> : <EmptyState title="Соберите свой игровой ритм" description="Объединяйте макросы и запускайте их одним нажатием." action={<button className="button button-secondary" onClick={() => setDialog({ type: 'group' })}><Plus size={15} />Создать группу</button>} />}</section>
              <div className="overview-bottom"><section className="interactive-panel macros-panel"><div className="panel-heading"><h2>Макросы<span className="section-count">{macros.length}</span></h2><SectionLink onClick={() => navigate('macros')}>Все макросы</SectionLink></div><MacroTable macros={macros.slice(0, 5)} running={running} phases={macroPhases} onToggle={toggleMacro} onEdit={(macro) => setDialog({ type: 'macro', macro })} compact /></section><section className="interactive-panel activity-panel"><div className="panel-heading"><h2>Активность</h2><span className="panel-date">{period === 'Последние 7 дней' ? 'За 7 дней' : 'Сегодня'}</span></div><ActivityList events={visibleEvents} /><button className="activity-footer" onClick={() => navigate('logs')}>Открыть журнал<ArrowUpRight size={14} /></button></section></div>
              <div className="overview-note"><ShieldCheck size={13} /><span>Ваши настройки и макросы хранятся только на этом устройстве.</span></div>
            </>}

            {page === 'macros' && <>
              <div className="page-heading"><div><h1>Мои макросы<span className="heading-dot">.</span></h1><p>Каждая мелочь настроена под ваш ритм.</p></div><button className="button button-primary" onClick={() => setDialog({ type: 'macro' })}><Plus size={16} />Новый макрос</button></div>
              <div className="page-toolbar"><div className="tabs" aria-label="Фильтр макросов">{[['all', 'Все макросы', macros.length], ['enabled', 'Включённые', enabledCount], ['disabled', 'Выключенные', macros.length - enabledCount]].map(([value, label, count]) => <button key={value} className={macroFilter === value ? 'active' : ''} onClick={() => setMacroFilter(String(value))}>{label}<span>{count}</span></button>)}</div><div className="toolbar-right"><div className="input-search"><Search size={15} /><input aria-label="Поиск макросов" placeholder="Найти макрос..." value={macroSearch} onChange={(event) => setMacroSearch(event.target.value)} /></div><div className="view-switch"><IconButton icon={List} label="Список" className={macroView === 'list' ? 'active' : ''} onClick={() => setMacroView('list')} /><IconButton icon={LayoutGrid} label="Плитка" className={macroView === 'grid' ? 'active' : ''} onClick={() => setMacroView('grid')} /></div></div></div>
              <section className={`full-macro-panel ${macroView === 'grid' ? 'is-grid' : ''}`}><div className="table-labels"><span>НАЗВАНИЕ МАКРОСА</span><span>СОСТОЯНИЕ</span></div><MacroTable macros={filteredMacros} running={running} phases={macroPhases} onToggle={toggleMacro} onEdit={(macro) => setDialog({ type: 'macro', macro })} grid={macroView === 'grid'} /></section>
              <div className="list-summary"><span>{filteredMacros.length} {macroWord(filteredMacros.length)}<span className="inline-dot" />{enabledCount} включено</span><button className="text-button" onClick={() => { const enable = enabledCount < macros.length; setMacros((previous) => previous.map((macro) => ({ ...macro, enabled: enable }))); runtimeRef.current = {}; setMacroPhases({}); addEvent(enable ? 'Все макросы включены' : 'Все макросы выключены'); }}>{enabledCount < macros.length ? 'Включить все' : 'Выключить все'}</button></div>
              <div className="context-note"><Keyboard size={17} /><p>Нажмите <kbd>{settings.shortcut}</kbd>, чтобы {running ? 'приостановить' : 'запустить'} сессию. Нажмите на название макроса, чтобы изменить настройки.</p></div>
            </>}

            {page === 'groups' && !selectedGroup && <>
              <div className="page-heading"><div><h1>Группы<span className="heading-dot">.</span></h1><p>Нужные действия вместе. Один запуск вместо десятка.</p></div><button className="button button-primary" onClick={() => setDialog({ type: 'group' })}><Plus size={16} />Создать группу</button></div>
              <div className="page-toolbar"><div className="toolbar-title">Все группы<span className="section-count">{groups.length}</span></div><div className="input-search"><Search size={15} /><input aria-label="Поиск групп" placeholder="Найти группу..." value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} /></div></div>
              {filteredGroups.length > 0 ? <div className="group-grid all-groups-grid">{filteredGroups.map(renderGroup)}<button className="create-group-tile" onClick={() => setDialog({ type: 'group' })}><Plus size={23} strokeWidth={1.4} /><span>Новая группа</span><small>Соберите свой сценарий</small></button></div> : <EmptyState title={groupSearch ? 'Группа не найдена' : 'Ваш первый сценарий'} description={groupSearch ? 'Попробуйте другое название.' : 'Объедините любимые макросы в одну группу.'} action={!groupSearch && <button className="button button-primary" onClick={() => setDialog({ type: 'group' })}><Plus size={15} />Создать группу</button>} />}
              <div className="context-note"><Layers size={18} /><p>Один макрос может быть в нескольких группах. При запуске группы включаются только её макросы.</p></div>
            </>}

            {page === 'groups' && selectedGroup && <>
              <button className="back-link" onClick={() => navigate('groups')}><ArrowLeft size={15} />Все группы</button>
              <div className="page-heading group-detail-heading"><div className="group-detail-title"><span className="group-detail-icon" style={{ '--group-color': selectedGroup.color } as CSSProperties}><DepthIcon kind="folder" size={35} /></span><div><h1>{selectedGroup.name}</h1><p>{selectedGroup.description || 'Ваш персональный сценарий'}</p></div></div><div className="heading-actions"><IconButton icon={Pencil} label="Редактировать группу" onClick={() => setDialog({ type: 'group', group: selectedGroup })} /><button className="button button-primary" onClick={() => runGroup(selectedGroup)}><Play size={14} fill="currentColor" />Запустить группу</button></div></div>
              <div className="page-toolbar"><div className="toolbar-title">Макросы группы<span className="section-count">{selectedGroup.macroIds.length}</span></div><button className="button button-secondary" onClick={() => setDialog({ type: 'group', group: selectedGroup })}><Plus size={15} />Изменить состав</button></div>
              <section className="full-macro-panel"><div className="table-labels"><span>НАЗВАНИЕ МАКРОСА</span><span>СОСТОЯНИЕ</span></div><MacroTable macros={macros.filter((macro) => selectedGroup.macroIds.includes(macro.id))} running={running} phases={macroPhases} onToggle={toggleMacro} onEdit={(macro) => setDialog({ type: 'macro', macro })} /></section>
              <div className="list-summary"><span style={{ color: selectedGroup.color }}><Folder size={14} />{selectedGroup.macroIds.length} {macroWord(selectedGroup.macroIds.length)} в группе</span><button className="text-button danger-text" onClick={() => deleteGroup(selectedGroup)}><Trash2 size={14} />Удалить группу</button></div>
            </>}

            {page === 'stats' && <>
              <div className="page-heading"><div><h1>Статистика<span className="heading-dot">.</span></h1><p>Больше прогресса, меньше усилий.</p></div><button className="button button-secondary" onClick={() => { downloadFile('delkol-statistics.csv', '\uFEFFМакрос;Циклы;Состояние\n' + macros.map((macro) => `"${macro.name.replace(/"/g, '""')}";${macro.cycles};${macro.enabled ? 'Включён' : 'Выключен'}`).join('\n'), 'text/csv;charset=utf-8'); notify('Статистика экспортирована в CSV.'); }}><Download size={15} />Экспорт отчёта</button></div>
              <div className="stats-overview">
                <div className="stats-card"><span className="stats-card-label"><Layers size={12} />Выполнено циклов</span><strong>{macros.reduce((sum, macro) => sum + macro.cycles, 0).toLocaleString('ru-RU')}</strong><small>за всё время<i className="stats-trend up">+{sessionCycles} за сессию</i></small><span className="stats-spark" aria-hidden="true"><i style={{ height: '30%' }} /><i style={{ height: '55%' }} /><i style={{ height: '42%' }} /><i style={{ height: '68%' }} /><i style={{ height: '50%' }} /><i style={{ height: '82%' }} /><i style={{ height: '64%' }} /><i style={{ height: '90%' }} /><i style={{ height: '72%' }} /><i style={{ height: '100%' }} /></span></div>
                <div className="stats-card"><span className="stats-card-label"><Clock3 size={12} />Текущая сессия</span><strong className="tabular">{formatElapsed(elapsed)}</strong><small>{running ? 'в процессе' : 'на паузе'}<i className={`stats-trend ${running ? 'up' : ''}`}>{enabledCount} {macroWord(enabledCount)} вкл.</i></small><span className={`stats-pulse ${running ? 'live' : ''}`} aria-hidden="true"><i /><i /><i /><i /><i /></span></div>
                <div className="stats-card"><span className="stats-card-label"><Activity size={12} />Циклов за сессию</span><strong>{sessionCycles}</strong><small>{enabledCount} {macroWord(enabledCount)} включено<i className="stats-trend up">{running ? 'обновляется' : 'ожидание'}</i></small><span className="stats-spark" aria-hidden="true"><i style={{ height: '40%' }} /><i style={{ height: '26%' }} /><i style={{ height: '58%' }} /><i style={{ height: '34%' }} /><i style={{ height: '70%' }} /><i style={{ height: '48%' }} /><i style={{ height: '86%' }} /><i style={{ height: '60%' }} /><i style={{ height: '92%' }} /><i style={{ height: '76%' }} /></span></div>
                <div className="stats-card"><span className="stats-card-label"><Check size={12} />Макросов</span><strong>{macros.length}<em>/{macros.length ? Math.max(macros.length, enabledCount) : 0}</em></strong><small>активных: {enabledCount}<i className="stats-trend">из {macros.length}</i></small><span className="stats-ring" style={{ '--ring': `${macros.length ? Math.round(enabledCount / macros.length * 100) : 0}%` } as CSSProperties} aria-hidden="true"><strong>{macros.length ? Math.round(enabledCount / macros.length * 100) : 0}%</strong></span></div>
              </div>
              <div className="stats-panels">
                <section className="chart-section"><div className="panel-head"><h2>Ваш игровой ритм</h2><span className="panel-meta">Событий <b>{visibleEvents.length}</b> · Циклов <b>{sessionCycles}</b></span><select className="select-control" aria-label="Период статистики" value={statsRange} onChange={(event) => setStatsRange(event.target.value)}><option value="1">День</option><option value="7">Неделя</option><option value="30">Месяц</option></select></div><ActivityChart range={statsRange} cycles={sessionCycles} /><p className="chart-caption">Пример активности сохранённого демо-профиля. Счётчики выше обновляются во время сессии.</p></section>
                <section className="chart-section breakdown-section"><div className="panel-head"><h2>Распределение циклов</h2><span className="panel-meta">Всего <b>{macros.reduce((sum, macro) => sum + macro.cycles, 0).toLocaleString('ru-RU')}</b></span></div><div className="stats-breakdown">{macros.map((macro) => { const share = Math.round(macro.cycles / Math.max(macros.reduce((sum, item) => sum + item.cycles, 0), 1) * 100); return <div className="stats-breakdown-row" key={macro.id}><span className="breakdown-name"><MacroIcon kind={macro.kind} size={14} />{macro.name}</span><div className="breakdown-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(4, share)}%` }} transition={{ duration: .6 }} /></div><span className="breakdown-value tabular">{macro.cycles.toLocaleString('ru-RU')}<em>{share}%</em></span></div>; })}</div></section>
              </div>
              <section className="macro-statistics"><div className="panel-head"><h2>По макросам</h2><span className="panel-meta">Выполнено циклов</span></div>{macros.map((macro) => <button className="macro-stat-row" key={macro.id} onClick={() => setDialog({ type: 'macro', macro })}><MacroIcon kind={macro.kind} /><span>{macro.name}</span><div className="stat-bar"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(3, macro.cycles / Math.max(...macros.map((item) => item.cycles), 1) * 100)}%` }} transition={{ duration: 0.6 }} /></div><strong>{macro.cycles}</strong><ChevronRight size={15} /></button>)}</section>
            </>}

            {page === 'logs' && <>
              <div className="page-heading"><div><h1>Журнал<span className="heading-dot">.</span></h1><p>Все события вашего пространства, без лишнего шума.</p></div><div className="heading-actions"><IconButton icon={Trash2} label="Очистить журнал" disabled={!events.length} onClick={() => setDialog({ type: 'confirm', title: 'Очистить журнал?', description: 'Все события текущего сеанса будут удалены. Новые события продолжат появляться.', button: 'Очистить', action: () => { setEvents([]); notify('Журнал очищен.'); } })} /><button className="button button-secondary" onClick={exportLogs} disabled={!events.length}><ArrowDownToLine size={15} />Экспорт журнала</button></div></div>
              <div className="page-toolbar"><div className="tabs">{[['all', 'Все события'], ['success', 'Успешные'], ['info', 'Информация'], ['warning', 'Внимание']].map(([value, label]) => <button key={value} className={logFilter === value ? 'active' : ''} onClick={() => setLogFilter(value)}>{label}</button>)}</div><div className="input-search"><Search size={15} /><input aria-label="Поиск в журнале" placeholder="Поиск событий..." value={logSearch} onChange={(event) => setLogSearch(event.target.value)} /></div></div>
              <div className="journal-table"><div className="journal-table-head"><span>ВРЕМЯ</span><span>СОБЫТИЕ</span><span>ТИП</span></div>{filteredLogs.length ? filteredLogs.map((event) => <div className="journal-row" key={event.id}><time>{formatTime(event.time)}<span>{new Date(event.time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span></time><div className="journal-event"><span className={`journal-event-icon ${event.type}`}>{event.type === 'success' ? <Check size={15} /> : event.type === 'warning' ? <TriangleAlert size={15} /> : <Info size={15} />}</span><div><strong>{event.title}</strong><span>{event.detail}</span></div></div><span className={`event-type ${event.type}`}>{event.type === 'success' ? 'Успешно' : event.type === 'warning' ? 'Внимание' : 'Информация'}</span></div>) : <EmptyState icon={ScrollText} title="Событий не найдено" description="Измените фильтр или запустите сессию, чтобы увидеть новые события." />}</div>
              <div className="list-summary"><span>Показано событий: {filteredLogs.length}</span><span><span className="live-dot" />Обновляется автоматически</span></div>
            </>}

            {page === 'settings' && <SettingsPage
              settings={settings} profile={profile} macros={macros} groups={groups} configs={configs}
              activeConfigId={activeConfigId} tab={settingsTab} onTab={setSettingsTab} storageHealthy={storageHealthy}
              onChange={(patch) => { setSettings((previous) => ({ ...previous, ...patch })); addEvent('Настройки пространства обновлены', 'Изменения применены к текущему конфигу'); }}
              onSaveConfig={() => setDialog({ type: 'config-save' })} onImportConfig={() => setDialog({ type: 'config-import' })}
              onApplyConfig={requestApplyConfig} onDownloadConfig={(item) => { downloadConfig(item.config); notify(`Конфиг «${item.config.name}» скачан.`); }}
              onRenameConfig={(config) => setDialog({ type: 'config-rename', config })} onUpdateConfig={updateConfiguration} onDeleteConfig={deleteConfiguration}
              onProfile={() => navigate('profile')} onHelp={() => setDialog({ type: 'help' })}
              account={account} communityProfile={communityProfile} onNotify={notify}
              onApplyCommunityConfig={applyCommunityConfig} onFrameChanged={handleFrameChanged}
              onReset={() => setDialog({ type: 'confirm', title: 'Начать с чистого листа?', description: 'Вернутся исходные макросы, группы и настройки интерфейса. Сохранённые конфиги и личный профиль останутся без изменений.', button: 'Сбросить', action: () => {
                setRunning(false); setMacros(INITIAL_MACROS); setGroups(INITIAL_GROUPS); setSettings((previous) => ({ ...DEFAULT_SETTINGS, name: previous.name }));
                setElapsed(0); setSessionCycles(0); setActiveGroupId(null); setActiveConfigId(''); ticksRef.current = 0; runtimeRef.current = {}; setMacroPhases({});
                addEvent('Начальные настройки восстановлены', 'Профиль и библиотека конфигов сохранены', 'success'); notify('Настройки восстановлены. Ваши конфиги и профиль сохранены.');
              } })}
            />}
            {page === 'profile' && <ProfilePage profile={profile} username={settings.name} macroCount={macros.length} groupCount={groups.length} configCount={configs.length} storageHealthy={storageHealthy} onSave={saveProfile} onDirtyChange={onProfileDirtyChange} onMacros={() => navigate('macros')} onGroups={() => navigate('groups')} onConfigs={openConfigs} onNotify={notify}
              account={account} isGuest={isGuest} cloudStatus={cloudStatus} cloudPush={cloudPush} cloudError={cloudError} onRetryCloud={retryCloudSync} onSignOut={handleSignOut} onChangePassword={handleChangePassword}
              communityProfile={communityProfile} onOpenShop={() => { setSettingsTab('shop'); navigate('settings'); }} />}
          </motion.div>
        </main>
        <div className="content-bottom-fade" aria-hidden="true" />
        </div>

        <footer className="statusbar"><div><span className={`system-status ${running ? 'is-running' : ''}`}><i />{running ? 'Сессия активна' : elapsed ? 'Сессия на паузе' : 'Система готова'}</span><span className="statusbar-divider" /><span className="demo-label" title="Интерактивная демонстрация интерфейса. Не подключается к игре.">Демо-режим</span>{running && <span className="status-elapsed">{formatElapsed(elapsed)}</span>}</div><div>{window.delkol?.hudSetEnabled && <><button className={`shortcut-hint hud-toggle ${hudOn ? 'on' : ''}`} onClick={toggleHud} title={hudOn ? 'Скрыть HUD-пилюлю за краем окна' : 'Показать HUD-пилюлю за краем окна'}><Gauge size={13} /><span>HUD</span></button><span className="statusbar-divider" /></>}<button className="shortcut-hint" onClick={toggleSession}><Keyboard size={13} /><kbd>{settings.shortcut}</kbd><span>Запуск / пауза</span></button><span className="statusbar-divider" /><button className="version-label" onClick={() => setDialog({ type: 'updates' })}>v.1.2.0<span className="version-dot" /></button></div></footer>
      </div>
    </div>

      <AnimatePresence mode="wait">
        {workspaceWindow.state !== 'open' && <WindowStandby key={workspaceWindow.state} state={workspaceWindow.state} running={running} elapsed={elapsed} saved={storageHealthy} onRestore={workspaceWindow.restore} onClose={requestCloseWindow} />}
      </AnimatePresence>

      <ProfilePopupHost open={!!profilePopup && workspaceWindow.state === 'open' && !dialog}>
        <ProfilePopup profile={profile} handle={settings.name} communityProfile={communityProfile} anchor={profilePopup ?? { x: 80, y: 80 }} onClose={() => setProfilePopup(null)} onOpen={openProfilePage} onOpenShop={openShopFromPopup} />
      </ProfilePopupHost>

      <AnimatePresence mode="wait">
        {dialog?.type === 'config-save' && <Modal key="save-config" title="Сохранить конфиг" subtitle="Сохраните свой ритм, чтобы вернуться к нему позже." onClose={() => setDialog(null)}><SaveConfigDialog configs={configs} macroCount={macros.length} groupCount={groups.length} onSave={saveCurrentConfig} onCancel={() => setDialog(null)} /></Modal>}
        {dialog?.type === 'config-import' && <Modal key="import-config" title="Добавить конфигурацию" subtitle="Перенесите привычные настройки в ваше пространство." onClose={() => setDialog(null)}><ImportConfigDialog configs={configs} onImport={importConfiguration} onCancel={() => setDialog(null)} /></Modal>}
        {dialog?.type === 'config-rename' && <Modal key={`rename-${dialog.config.id}`} title="Название и описание" subtitle="Дайте конфигу понятное имя." onClose={() => setDialog(null)}><SaveConfigDialog configs={configs} macroCount={dialog.config.config.macros.length} groupCount={dialog.config.config.groups.length} editing={dialog.config} onSave={(name, description) => renameConfiguration(dialog.config, name, description)} onCancel={() => setDialog(null)} /></Modal>}
        {dialog?.type === 'group' && <Modal key={`group-${dialog.group?.id ?? 'new'}`} title={dialog.group ? 'Редактировать группу' : 'Новая группа'} subtitle="Соберите нужные действия в один сценарий." onClose={() => setDialog(null)}><GroupEditor group={dialog.group} macros={macros} onSave={saveGroup} onCancel={() => setDialog(null)} /></Modal>}
        {dialog?.type === 'macro' && <MacroEditor key={`macro-${dialog.macro?.id ?? 'new'}`} macro={dialog.macro} groups={groups} initialGroupId={dialog.groupId} onSave={saveMacro} onCancel={() => setDialog(null)} onDelete={deleteMacro} />}
        {dialog?.type === 'search' && <Modal key="search-modal" title="Найдём нужное" onClose={() => setDialog(null)} wide><SearchDialog macros={macros} groups={groups} configs={configs} onNavigate={(nextPage, groupId) => navigate(nextPage, groupId, () => setDialog(null))} onMacro={(macro) => navigate('macros', null, () => setDialog({ type: 'macro', macro }))} onConfig={(config) => navigate('settings', null, () => { setSettingsTab('configs'); setDialog(null); requestApplyConfig(config); })} /></Modal>}
        {dialog?.type === 'share' && <Modal key="share-modal" title="Поделиться пространством" subtitle="Ваши настройки, без привязки к устройству." onClose={() => setDialog(null)}><ShareDialog macros={macros} groups={groups} name={settings.name} onExport={exportWorkspace} onNotify={notify} /></Modal>}
        {dialog?.type === 'confirm' && <Modal key="confirm-modal" title={dialog.title} onClose={() => setDialog(null)}><p className="confirm-description">{dialog.description}</p><div className="modal-actions"><button className="button button-secondary" onClick={() => setDialog(null)}>Отмена</button><button className={`button ${dialog.tone === 'primary' ? 'button-primary' : 'button-danger'}`} onClick={() => { setDialog(null); dialog.action(); }}>{dialog.button ?? 'Удалить'}</button></div></Modal>}
        {dialog?.type === 'help' && <Modal key="help-modal" title="Всё просто. Мы рядом." subtitle="Небольшая инструкция по вашему пространству." onClose={() => setDialog(null)}><HelpContent shortcut={settings.shortcut} onGoSettings={() => { setDialog(null); navigate('settings'); }} /></Modal>}
        {dialog?.type === 'updates' && <Modal key="updates-modal" title={`Новый ритм ${BRAND_NAME}`} subtitle="Что нового в вашем пространстве" onClose={() => setDialog(null)}><UpdatesContent onClose={() => setDialog(null)} /></Modal>}
      </AnimatePresence>
      <AnimatePresence>{toast && <motion.div className={`toast toast-${toast.type}`} role="status" key={toast.id} initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}><span className="toast-icon">{toast.type === 'warning' ? <TriangleAlert size={17} /> : toast.type === 'info' ? <Info size={17} /> : <Check size={17} />}</span><span>{toast.text}</span><button aria-label="Закрыть уведомление" onClick={() => setToast(null)}><X size={14} /></button></motion.div>}</AnimatePresence>
    </div>
  </MotionConfig>;
}
