import { supabase } from './supabase';
import type { CloudAccount } from './supabase';

/**
 * Community layer: top configs, likes, frames shop and public profiles.
 * All writes go through atomic RPCs (see supabase/schema.sql part 6).
 */

export interface CommunityProfile {
  id: string;
  userId: string | null;
  handle: string;
  displayName: string;
  avatar: string;
  frame: string;
  ownedFrames: string[];
  coins: number;
  followers: number;
  profileViews: number;
  isBot: boolean;
}

export interface CommunityConfig {
  id: string;
  name: string;
  description: string;
  config: unknown;
  likes: number;
  dislikes: number;
  downloads: number;
  views: number;
  createdAt: string;
  author: CommunityProfile | null;
  /** My reaction, if any (only for signed-in users). */
  reaction?: 'like' | 'dislike' | null;
}

export interface FrameInfo {
  id: string;
  name: string;
  price: number;
  rarity: string;
}

function mapProfile(row: Record<string, unknown>): CommunityProfile {
  return {
    id: String(row.id),
    userId: (row.user_id as string | null) ?? null,
    handle: String(row.handle ?? ''),
    displayName: String(row.display_name ?? row.handle ?? ''),
    avatar: String(row.avatar ?? ''),
    frame: String(row.frame ?? 'none'),
    ownedFrames: Array.isArray(row.owned_frames) ? (row.owned_frames as string[]) : ['none', 'sakura'],
    coins: Number(row.coins ?? 0),
    followers: Number(row.followers ?? 0),
    profileViews: Number(row.profile_views ?? 0),
    isBot: Boolean(row.is_bot ?? false),
  };
}

/** Read my social profile; null if missing or signed out. */
export async function fetchMyProfile(account: CloudAccount | null): Promise<CommunityProfile | null> {
  if (!account) return null;
  const { data, error } = await supabase
    .from('social_profiles')
    .select('*')
    .eq('user_id', account.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapProfile(data) : null;
}

/**
 * Ensure my social profile exists; create it on first login with a unique handle.
 * Returns the profile.
 */
export async function ensureMyProfile(account: CloudAccount, handle: string, displayName: string, avatar: string): Promise<CommunityProfile> {
  const existing = await fetchMyProfile(account);
  if (existing) return existing;

  const base = (handle || displayName || account.email.split('@')[0] || 'player')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 24) || 'player';
  let candidate = base;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase
      .from('social_profiles')
      .insert({ user_id: account.id, handle: candidate, display_name: displayName.slice(0, 32), avatar: avatar.slice(0, 400_000) })
      .select('*')
      .maybeSingle();
    if (!error && data) return mapProfile(data);
    // Handle taken or other conflict → add numeric suffix and retry.
    candidate = `${base.slice(0, 19)}${Math.floor(Math.random() * 9000) + 100}`;
  }
  throw new Error('Не удалось создать публичный профиль. Попробуйте позже.');
}

/** Persist handle / display name / avatar to the public profile after saving the profile page. */
export async function syncMyProfile(account: CloudAccount, patch: { handle?: string; displayName?: string; avatar?: string }): Promise<void> {
  if (!account) return;
  const update: Record<string, unknown> = {};
  if (patch.handle) update.handle = patch.handle;
  if (patch.displayName !== undefined) update.display_name = patch.displayName.slice(0, 32);
  if (patch.avatar !== undefined) update.avatar = patch.avatar.slice(0, 400_000);
  if (!Object.keys(update).length) return;
  const { error } = await supabase
    .from('social_profiles')
    .update(update)
    .eq('user_id', account.id);
  // Unique-handle conflicts surface here as errors; callers decide how to notify.
  if (error) throw new Error(error.message);
}

export async function setMyFrame(account: CloudAccount, frameId: string): Promise<void> {
  if (!account) throw new Error('AUTH_REQUIRED');
  const { error } = await supabase
    .from('social_profiles')
    .update({ frame: frameId })
    .eq('user_id', account.id);
  if (error) throw new Error(error.message);
}

export async function fetchFrames(): Promise<FrameInfo[]> {
  const { data, error } = await supabase
    .from('frames')
    .select('id, name, price, rarity')
    .order('sort');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    price: Number(row.price ?? 0),
    rarity: String(row.rarity ?? 'common'),
  }));
}

interface RawTopConfig {
  id: string;
  name: string;
  description: string;
  config: unknown;
  likes: number;
  dislikes: number;
  downloads: number;
  views: number;
  created_at: string;
  author: Record<string, unknown> | null;
}

/** Top published configs with author info (server sorts by likes). */
export async function fetchTopConfigs(limit = 100): Promise<CommunityConfig[]> {
  const { data, error } = await supabase
    .from('shared_configs')
    .select('id, name, description, config, likes, dislikes, downloads, views, created_at, author:author_id (id, user_id, handle, display_name, avatar, frame, owned_frames, coins, followers, profile_views, is_bot)')
    .order('likes', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return (data as unknown as RawTopConfig[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    config: row.config,
    likes: row.likes,
    dislikes: row.dislikes,
    downloads: row.downloads,
    views: row.views,
    createdAt: row.created_at,
    author: row.author ? mapProfile(row.author as Record<string, unknown>) : null,
  }));
}

/** Load my own reactions for a set of configs (only for signed-in users). */
export async function fetchMyReactions(configIds: string[]): Promise<Record<string, 'like' | 'dislike'>> {
  if (!configIds.length) return {};
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user) return {};
  const { data, error } = await supabase
    .from('config_reactions')
    .select('config_id, value')
    .in('config_id', configIds);
  if (error) return {};
  const map: Record<string, 'like' | 'dislike'> = {};
  for (const row of data ?? []) map[String(row.config_id)] = row.value === 'like' ? 'like' : 'dislike';
  return map;
}

/** Toggle or switch a like / dislike. Returns the new stored reaction. */
export async function reactToConfig(configId: string, value: 'like' | 'dislike'): Promise<'like' | 'dislike' | null> {
  const { data, error } = await supabase.rpc('react_to_config', { p_config_id: configId, p_value: value });
  if (error) throw new Error(friendlyRpc(error.message));
  return (data as { reaction?: 'like' | 'dislike' | null })?.reaction ?? null;
}

export async function recordConfigDownload(configId: string): Promise<void> {
  await supabase.rpc('record_config_download', { p_config_id: configId });
}

export async function recordProfileView(profileId: string): Promise<void> {
  await supabase.rpc('record_profile_view', { p_profile_id: profileId });
}

export async function purchaseFrame(account: CloudAccount, frameId: string): Promise<{ coins: number; owned: string[]; equipped: string }> {
  if (!account) throw new Error('AUTH_REQUIRED');
  const { data, error } = await supabase.rpc('purchase_frame', { p_frame_id: frameId });
  if (error) throw new Error(friendlyRpc(error.message));
  const result = data as { coins: number; owned: string[]; equipped: string };
  return { coins: result.coins, owned: result.owned ?? [], equipped: result.equipped };
}

/** Publish one of my saved configs to the community top. */
export async function publishConfig(account: CloudAccount, payload: { name: string; description: string; config: unknown }): Promise<void> {
  if (!account) throw new Error('AUTH_REQUIRED');
  const fallback = account.email.split('@')[0] ?? 'player';
  const profile = await ensureMyProfile(account, fallback, fallback, '');
  const { error } = await supabase.from('shared_configs').insert({
    author_id: profile.id,
    name: payload.name.slice(0, 60),
    description: payload.description.slice(0, 160),
    config: payload.config,
  });
  if (error) throw new Error(error.message);
}

function friendlyRpc(raw: string): string {
  if (raw.includes('AUTH_REQUIRED')) return 'Войдите в аккаунт, чтобы это сделать.';
  if (raw.includes('NO_COINS')) return 'Не хватает монет для этой рамки.';
  if (raw.includes('NO_PROFILE')) return 'Профиль ещё не создан.';
  if (raw.includes('NO_FRAME')) return 'Рамка не найдена.';
  if (raw.includes('network') || raw.includes('fetch')) return 'Нет соединения с сервером.';
  return raw;
}

/** Format numbers Telegram-style: 12.4K, 3.1M. */
export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value);
}
