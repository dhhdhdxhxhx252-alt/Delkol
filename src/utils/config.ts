import { DEFAULT_SETTINGS, INITIAL_GROUPS, INITIAL_MACROS, type Macro, type MacroGroup, type MacroKind, type Settings } from '../data';
import { getAutomation, normalizeAutomation } from '../macros/automation';
import { BRAND_NAME } from '../brand';

/** Theme is a per-device preference — it never travels inside config files. */
export type ConfigSettings = Omit<Settings, 'name' | 'theme'>;
export type SettingsTab = 'configs' | 'top' | 'shop' | 'appearance' | 'optimize' | 'session';

export interface WorkspaceConfig {
  version: 1;
  name: string;
  description: string;
  exportedAt: string;
  macros: Macro[];
  groups: MacroGroup[];
  settings: ConfigSettings;
}

export interface SavedConfig {
  id: string;
  savedAt: number;
  source: 'local' | 'import' | 'backup';
  config: WorkspaceConfig;
}

export const MAX_CONFIGS = 30;
export const MAX_CONFIG_BYTES = 1024 * 1024;
const KINDS = ['fishing', 'racing', 'cafe', 'quests', 'artifacts'];

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: ожидался объект.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max) throw new Error(`${label}: укажите текст ${allowEmpty ? 'длиной ' : 'от 1 '}до ${max} символов.`);
  return value.trim();
}

function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label}: допустимо целое число от ${min} до ${max}.`);
  return value;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value) || ['constructor', 'prototype', '__proto__'].includes(value)) throw new Error(`${label}: некорректный идентификатор.`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label}: ожидалось true или false.`);
  return value;
}

export function configSettings(settings: Settings | ConfigSettings): ConfigSettings {
  return { notifications: settings.notifications, compact: settings.compact, animations: settings.animations, stopOnError: true, shortcut: settings.shortcut };
}

export function makeConfig(name: string, description: string, macros: Macro[], groups: MacroGroup[], settings: Settings | ConfigSettings): WorkspaceConfig {
  return {
    version: 1, name: name.trim(), description: description.trim(), exportedAt: new Date().toISOString(),
    macros: macros.map((macro) => ({ ...macro, automation: getAutomation(macro) })),
    groups: groups.map((group) => ({ ...group, macroIds: [...group.macroIds] })),
    settings: configSettings(settings),
  };
}

// Reconstruct a whitelisted payload instead of merging untrusted JSON into app state.
export function normalizeConfig(value: unknown, fallbackName = 'Импортированный конфиг'): WorkspaceConfig {
  const root = record(value, 'Конфигурация');
  if (root.version !== 1) throw new Error(`Версия конфигурации не поддерживается. Нужен JSON ${BRAND_NAME} версии 1.`);
  if (!Array.isArray(root.macros) || root.macros.length > 200) throw new Error('В конфигурации должен быть массив macros: не более 200 макросов.');
  if (!Array.isArray(root.groups) || root.groups.length > 100) throw new Error('В конфигурации должен быть массив groups: не более 100 групп.');

  const macroIds = new Set<string>();
  const macros: Macro[] = root.macros.map((value, index) => {
    const item = record(value, `Макрос ${index + 1}`);
    const id = identifier(item.id, 'ID макроса');
    if (macroIds.has(id)) throw new Error(`ID макроса «${id}» повторяется.`);
    macroIds.add(id);
    if (typeof item.kind !== 'string' || !KINDS.includes(item.kind)) throw new Error(`Макрос ${index + 1}: неизвестная категория.`);
    return {
      id, kind: item.kind as MacroKind, name: text(item.name, 'Название макроса', 40),
      description: text(item.description ?? '', 'Описание макроса', 90, true),
      enabled: boolean(item.enabled, 'Состояние макроса'),
      cycles: integer(item.cycles ?? 0, 'Количество циклов', 0, Number.MAX_SAFE_INTEGER),
      delay: integer(item.delay, 'Интервал', 1, 60), repeats: integer(item.repeats ?? 0, 'Повторения', 0, 9999),
      automation: normalizeAutomation(item.kind as MacroKind, item.automation),
    };
  });

  const groupIds = new Set<string>();
  const groups: MacroGroup[] = root.groups.map((value, index) => {
    const item = record(value, `Группа ${index + 1}`);
    const id = identifier(item.id, 'ID группы');
    if (groupIds.has(id)) throw new Error(`ID группы «${id}» повторяется.`);
    groupIds.add(id);
    if (typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color)) throw new Error(`Группа ${index + 1}: цвет должен быть в формате #RRGGBB.`);
    if (!Array.isArray(item.macroIds) || item.macroIds.length > 200) throw new Error(`Группа ${index + 1}: неверный список макросов.`);
    const ids = item.macroIds.map((value) => identifier(value, 'ID макроса группы'));
    if (ids.some((macroId) => !macroIds.has(macroId))) throw new Error(`Группа «${item.name}» ссылается на отсутствующий макрос.`);
    return { id, name: text(item.name, 'Название группы', 40), description: text(item.description ?? '', 'Описание группы', 90, true), color: item.color, macroIds: [...new Set(ids)] };
  });

  const preferences = record(root.settings, 'Настройки');
  const shortcut = preferences.shortcut;
  if (shortcut !== 'F6' && shortcut !== 'F8' && shortcut !== 'F9') throw new Error('Горячая клавиша должна быть F6, F8 или F9.');
  const settings: ConfigSettings = {
    notifications: boolean(preferences.notifications, 'Уведомления'),
    compact: boolean(preferences.compact, 'Компактный режим'),
    animations: boolean(preferences.animations, 'Анимации'), stopOnError: true, shortcut,
  };
  const exportedAt = typeof root.exportedAt === 'string' && Number.isFinite(Date.parse(root.exportedAt)) ? new Date(root.exportedAt).toISOString() : new Date().toISOString();
  return {
    version: 1, name: text(root.name ?? fallbackName.slice(0, 60), 'Название конфига', 60),
    description: text(root.description ?? '', 'Описание конфига', 160, true), exportedAt, macros, groups, settings,
  };
}

export function parseConfig(contents: string, filename: string): WorkspaceConfig {
  let value: unknown;
  try { value = JSON.parse(contents.replace(/^\uFEFF/, '')); }
  catch { throw new Error(`Файл не является корректным JSON. Выберите конфигурацию, экспортированную из ${BRAND_NAME}.`); }
  return normalizeConfig(value, filename.replace(/\.json$/i, '') || 'Импортированный конфиг');
}

export function configFingerprint(macros: Macro[], groups: MacroGroup[], settings: Settings | ConfigSettings): string {
  return JSON.stringify({
    macros: macros.map((macro) => { const { id, name, description, kind, enabled, delay, repeats } = macro; return { id, name, description, kind, enabled, delay, repeats, automation: getAutomation(macro) }; }),
    groups: groups.map(({ id, name, description, color, macroIds }) => ({ id, name, description, color, macroIds })),
    settings: configSettings(settings),
  });
}

export function uniqueConfigName(name: string, configs: SavedConfig[]): string {
  const base = name.trim().slice(0, 50) || 'Новый конфиг';
  let candidate = base;
  let suffix = 2;
  while (configs.some((item) => item.config.name.toLowerCase() === candidate.toLowerCase())) candidate = `${base} (${suffix++})`;
  return candidate;
}

export function configFilename(name: string) {
  return `${name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').trim().slice(0, 80) || 'delkol-config'}.json`;
}

export function isSavedConfigList(value: unknown): value is SavedConfig[] {
  if (!Array.isArray(value) || value.length > MAX_CONFIGS) return false;
  try {
    const ids = new Set<string>();
    value.forEach((item) => {
      const saved = record(item, 'Сохранённый конфиг');
      const id = identifier(saved.id, 'ID конфига');
      if (ids.has(id)) throw new Error('Повтор ID.');
      ids.add(id);
      integer(saved.savedAt, 'Дата сохранения', 0, Number.MAX_SAFE_INTEGER);
      if (typeof saved.source !== 'string' || !['local', 'import', 'backup'].includes(saved.source)) throw new Error('Неизвестный источник.');
      const payload = record(saved.config, 'Конфигурация');
      text(payload.name, 'Название конфига', 60);
      text(payload.description, 'Описание конфига', 160, true);
      normalizeConfig(saved.config);
    });
    return true;
  } catch { return false; }
}

export const INITIAL_CONFIGS: SavedConfig[] = [{
  id: 'default', savedAt: Date.now(), source: 'local',
  config: makeConfig('Основной', 'Мой привычный игровой ритм', INITIAL_MACROS, INITIAL_GROUPS, DEFAULT_SETTINGS),
}];