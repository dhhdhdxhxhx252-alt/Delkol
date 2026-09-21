import type { MacroAutomation } from './macros/automation';
import { BRAND_NAME } from './brand';
import { assetUrl } from './paths';
import { isCatalogAvatar } from './avatars';

export type Page = 'overview' | 'macros' | 'groups' | 'stats' | 'logs' | 'settings' | 'profile';
export type MacroKind = 'fishing' | 'racing' | 'cafe' | 'quests' | 'artifacts';
export type EventType = 'success' | 'info' | 'warning';

export interface Macro {
  id: string;
  name: string;
  description: string;
  kind: MacroKind;
  enabled: boolean;
  cycles: number;
  delay: number;
  repeats: number;
  automation?: MacroAutomation;
}

export interface MacroGroup {
  id: string;
  name: string;
  description: string;
  color: string;
  macroIds: string[];
}

export interface ActivityEvent {
  id: string;
  title: string;
  detail: string;
  time: number;
  type: EventType;
}

export interface Settings {
  name: string;
  notifications: boolean;
  compact: boolean;
  animations: boolean;
  stopOnError: boolean;
  shortcut: 'F6' | 'F8' | 'F9';
  /** Interface theme: 'dark' (default) or 'light'. Persisted with the rest of the settings. */
  theme: 'dark' | 'light';
}

export type ProfileCover = 'pearl' | 'sky' | 'city' | 'custom';
export type AvatarFrameStyle =
  | 'none' | 'sakura'
  | 'amethyst' | 'kitty' | 'bunny' | 'dream' | 'blossom' | 'ocean'
  | 'neko' | 'angel' | 'witch' | 'mage' | 'mystic'
  | 'unicorn' | 'phoenix' | 'luna';

export interface FrameDef {
  id: AvatarFrameStyle;
  name: string;
  price: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  /** PNG overlay in public/images/frames (undefined for SVG-drawn sakura). */
  image?: string;
}

/**
 * Client-side mirror of the public.frames table (see supabase/schema.sql).
 * Sakura stays vector-drawn; the rest are PNG overlays (1080×1080, transparent
 * center) rendered on top of the avatar. See scripts/update-frames.mjs.
 */
export const FRAME_CATALOG: FrameDef[] = [
  { id: 'none', name: 'Без рамки', price: 0, rarity: 'common' },
  { id: 'sakura', name: 'Сакура', price: 0, rarity: 'common' },
  { id: 'amethyst', name: 'Аметист', price: 199, rarity: 'rare', image: '/images/frames/frame-01.png' },
  { id: 'kitty', name: 'Котик', price: 249, rarity: 'rare', image: '/images/frames/frame-02.png' },
  { id: 'bunny', name: 'Зайка', price: 239, rarity: 'rare', image: '/images/frames/frame-09.png' },
  { id: 'dream', name: 'Сновидение', price: 229, rarity: 'rare', image: '/images/frames/frame-07.png' },
  { id: 'blossom', name: 'Цветение', price: 259, rarity: 'rare', image: '/images/frames/frame-08.png' },
  { id: 'ocean', name: 'Океан', price: 269, rarity: 'rare', image: '/images/frames/frame-14.png' },
  { id: 'neko', name: 'Неко', price: 299, rarity: 'epic', image: '/images/frames/frame-03.png' },
  { id: 'angel', name: 'Ангел', price: 349, rarity: 'epic', image: '/images/frames/frame-04.png' },
  { id: 'witch', name: 'Ведьма', price: 399, rarity: 'epic', image: '/images/frames/frame-05.png' },
  { id: 'mage', name: 'Чародейка', price: 449, rarity: 'epic', image: '/images/frames/frame-06.png' },
  { id: 'mystic', name: 'Мистик', price: 499, rarity: 'epic', image: '/images/frames/frame-12.png' },
  { id: 'unicorn', name: 'Единорог', price: 749, rarity: 'legendary', image: '/images/frames/frame-10.png' },
  { id: 'phoenix', name: 'Феникс', price: 849, rarity: 'legendary', image: '/images/frames/frame-13.png' },
  { id: 'luna', name: 'Луна', price: 999, rarity: 'legendary', image: '/images/frames/frame-11.png' },
];

const FRAME_IDS = FRAME_CATALOG.map((frame) => frame.id);

export const RARITY_LABELS: Record<FrameDef['rarity'], string> = {
  common: 'Обычная', rare: 'Редкая', epic: 'Эпическая', legendary: 'Легендарная',
};

export function frameDef(id: string): FrameDef {
  return FRAME_CATALOG.find((frame) => frame.id === id) ?? FRAME_CATALOG[0];
}

export interface Profile {
  id: string;
  displayName: string;
  bio: string;
  avatar: string;
  cover: ProfileCover;
  coverImage: string;
  frame: AvatarFrameStyle;
  joinedAt: number;
}

export const PROFILE_COVERS = {
  pearl: { name: 'Перламутр', image: assetUrl('/images/profile-cover.jpg') },
  sky: { name: 'Тихое небо', image: assetUrl('/images/settings-sky.jpg') },
  city: { name: 'Хетеро', image: assetUrl('/images/hetero-city.jpg') },
};

export const MAX_AVATAR_CHARS = 400_000;
export const MAX_COVER_CHARS = 1_400_000;
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/;

export const DEFAULT_PROFILE: Profile = {
  id: 'delkol-hj-8f21', displayName: 'Hijiko', bio: 'Меньше рутины. Больше любимой игры.',
  avatar: assetUrl('/images/profile-avatar.jpg'), cover: 'pearl', coverImage: '', frame: 'sakura', joinedAt: Date.now(),
};

export function coverSource(profile: Pick<Profile, 'cover' | 'coverImage'>): string {
  if (profile.cover === 'custom') return profile.coverImage || PROFILE_COVERS.pearl.image;
  return PROFILE_COVERS[profile.cover].image;
}

export function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  const cover = profile.cover;
  const coverImage = profile.coverImage ?? '';
  const frame = profile.frame ?? 'sakura';
  return typeof profile.id === 'string' && typeof profile.displayName === 'string' && profile.displayName.length > 0 && profile.displayName.length <= 40
    && typeof profile.bio === 'string' && profile.bio.length <= 180
    && typeof profile.avatar === 'string' && (profile.avatar === '' || profile.avatar === assetUrl('/images/profile-avatar.jpg') || isCatalogAvatar(profile.avatar) || IMAGE_DATA_URL.test(profile.avatar))
    && profile.avatar.length <= MAX_AVATAR_CHARS
    && typeof cover === 'string' && ['pearl', 'sky', 'city', 'custom'].includes(cover)
    && typeof coverImage === 'string' && coverImage.length <= MAX_COVER_CHARS && (coverImage === '' || IMAGE_DATA_URL.test(coverImage))
    && !(cover === 'custom' && coverImage === '')
    && typeof frame === 'string' && FRAME_IDS.includes(frame as AvatarFrameStyle)
    && typeof profile.joinedAt === 'number' && Number.isFinite(profile.joinedAt);
}

// Older saves predate custom covers and avatar frames; fill them instead of resetting the profile.
export function normalizeProfile(value: unknown): Profile | null {
  if (!isProfile(value)) return null;
  const stored = value as Profile & { id: string };
  return {
    ...DEFAULT_PROFILE, ...stored,
    id: stored.id === 'nte-hj-8f21' ? DEFAULT_PROFILE.id : stored.id,
    coverImage: stored.coverImage ?? '',
    frame: (stored.frame && FRAME_IDS.includes(stored.frame) ? stored.frame : 'sakura') as AvatarFrameStyle,
  };
}

export const INITIAL_MACROS: Macro[] = [
  { id: 'fishing', name: 'Рыбалка', description: 'Автоматический улов', kind: 'fishing', enabled: true, cycles: 128, delay: 4, repeats: 0 },
  { id: 'racing', name: 'Гонки', description: 'Ваш идеальный маршрут', kind: 'racing', enabled: false, cycles: 18, delay: 6, repeats: 0 },
  { id: 'cafe', name: 'Кафе', description: 'Заказы без перерыва', kind: 'cafe', enabled: true, cycles: 42, delay: 5, repeats: 0 },
  { id: 'quests', name: 'Задания', description: 'Ежедневный прогресс', kind: 'quests', enabled: true, cycles: 16, delay: 8, repeats: 10 },
  { id: 'artifacts', name: 'Артефакты', description: 'Поиск ценных ресурсов', kind: 'artifacts', enabled: false, cycles: 64, delay: 7, repeats: 0 },
];

export const INITIAL_GROUPS: MacroGroup[] = [
  { id: 'daily', name: 'Ежедневные', description: 'Рыбалка, кафе и задания', color: '#9FB3DE', macroIds: ['fishing', 'cafe', 'quests'] },
  { id: 'resources', name: 'Фарм ресурсов', description: 'Всё ценное в одном месте', color: '#90B5A4', macroIds: ['fishing', 'artifacts'] },
  { id: 'favorites', name: 'Избранное', description: 'Для любимых моментов', color: '#D3AD86', macroIds: ['racing'] },
];

export const DEFAULT_SETTINGS: Settings = {
  name: 'hijiko', notifications: true, compact: false, animations: true, stopOnError: true, shortcut: 'F8', theme: 'dark',
};

export const GROUP_COLORS = ['#9FB3DE', '#90B5A4', '#D3AD86', '#8FAACF', '#CD91A4', '#AAAABD'];

export const PAGE_LABELS: Record<Page, string> = {
  overview: 'Обзор', macros: 'Мои макросы', groups: 'Группы', stats: 'Статистика', logs: 'Журнал', settings: 'Настройки', profile: 'Мой профиль',
};

export function initialEvents(): ActivityEvent[] {
  const now = Date.now();
  return [
    { id: 'welcome', title: 'Всё готово к запуску', detail: 'Рабочее пространство загружено', time: now - 60_000, type: 'success' },
    { id: 'profile', title: 'Настройки синхронизированы', detail: 'Локальный профиль @hijiko', time: now - 180_000, type: 'info' },
    { id: 'group', title: 'Группы макросов обновлены', detail: '3 группы в вашем пространстве', time: now - 360_000, type: 'info' },
    { id: 'version', title: `Добро пожаловать в ${BRAND_NAME}`, detail: 'Новый ритм вашей игры', time: now - 600_000, type: 'success' },
  ];
}

export function uid() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function formatTime(time: number) {
  return new Date(time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function formatElapsed(seconds: number) {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

export function macroWord(count: number) {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'макросов';
  if (count % 10 === 1) return 'макрос';
  if (count % 10 >= 2 && count % 10 <= 4) return 'макроса';
  return 'макросов';
}

export function downloadFile(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}