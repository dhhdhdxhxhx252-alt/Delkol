import { createClient } from '@supabase/supabase-js';
import type { Macro, MacroGroup, Profile, Settings } from '../data';

/**
 * Supabase integration for Delkol.
 *
 * Only the publishable (anon) key is embedded — it is safe because every table
 * is protected by row level security (see supabase/schema.sql). The secret key
 * must never be placed in the client.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://mrofddfrnalntypcbqad.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  'sb_publishable_vfMf279AmIS63dnGcRvBZw_KqPwxI5N';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'delkol.auth.v1',
  },
});

export type CloudStatus = 'offline' | 'connecting' | 'online' | 'error';

export interface CloudAccount {
  id: string;
  email: string;
  createdAt: string;
}

export interface CloudSnapshot {
  macros: Macro[];
  groups: MacroGroup[];
  settings: Settings;
  profile: Profile;
}

export interface WorkspaceRow {
  user_id: string;
  data: CloudSnapshot;
  updated_at: string;
}

export class AuthError extends Error {}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return String(error ?? 'Неизвестная ошибка');
}

function friendlyAuthMessage(raw: string): string {
  const text = raw.toLowerCase();
  if (text.includes('invalid login credentials')) return 'Неверный e-mail или пароль.';
  if (text.includes('user already registered') || text.includes('already been registered')) return 'Этот e-mail уже зарегистрирован.';
  if (text.includes('email not confirmed')) return 'Подтвердите e-mail по ссылке из письма.';
  if (text.includes('rate limit')) return 'Слишком много попыток. Подождите минуту.';
  if (text.includes('jwt expired') || text.includes('invalid jwt') || text.includes('jws signature') || text.includes('token use failed')) return 'Сессия истекла. Войдите в аккаунт заново.';
  if (text.includes('row-level security') || text.includes('permission denied')) return 'Сервер запретил операцию (политики доступа). Обратитесь в поддержку.';
  if (text.includes('duplicate key')) return 'Конфликт сохранения. Повторите попытку через пару секунд.';
  if (text.includes('failed to fetch') || text.includes('network')) return 'Нет соединения с сервером. Проверьте интернет.';
  return raw;
}

/**
 * Retry transient failures (offline hiccups, 5xx, rate limits) a few times
 * with backoff before surfacing the error to the user.
 */
async function withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    try {
      return await operation();
    } catch (cause) {
      lastError = cause;
      const message = messageOf(cause).toLowerCase();
      const transient = /failed to fetch|network|timeout|internal|site rq|rate limit|5\d\d/.test(message);
      if (!transient) throw cause;
    }
  }
  throw lastError;
}

export async function getSessionAccount(): Promise<CloudAccount | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  const user = data.session?.user;
  if (!user) return null;
  return { id: user.id, email: user.email ?? '', createdAt: user.created_at ?? '' };
}

export async function signIn(email: string, password: string): Promise<CloudAccount> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new AuthError(friendlyAuthMessage(error.message));
  const user = data.user;
  if (!user) throw new AuthError('Сервер не вернул пользователя.');
  return { id: user.id, email: user.email ?? email, createdAt: user.created_at ?? '' };
}

export async function signUp(email: string, password: string): Promise<{ account: CloudAccount | null; needsConfirm: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new AuthError(friendlyAuthMessage(error.message));
  if (!data.session) return { account: null, needsConfirm: true };
  const user = data.user!;
  return { account: { id: user.id, email: user.email ?? email, createdAt: user.created_at ?? '' }, needsConfirm: false };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new AuthError(friendlyAuthMessage(error.message));
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw new AuthError(friendlyAuthMessage(error.message));
}

export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new AuthError(friendlyAuthMessage(error.message));
}

/** Fetch the saved workspace snapshot for the signed-in user. */
export async function fetchSnapshot(userId: string): Promise<CloudSnapshot | null> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('workspaces')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new AuthError(friendlyAuthMessage(messageOf(error)));
    return (data?.data as CloudSnapshot | undefined) ?? null;
  });
}

/** Create or update the workspace snapshot for the signed-in user. */
export async function pushSnapshot(userId: string, snapshot: CloudSnapshot): Promise<void> {
  await withRetry(async () => {
    const row: WorkspaceRow = { user_id: userId, data: snapshot, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('workspaces').upsert(row, { onConflict: 'user_id' });
    if (error) throw new AuthError(friendlyAuthMessage(messageOf(error)));
  });
}

/** Ensure a profile row exists (used right after registration). */
export async function ensureWorkspaceRow(userId: string, snapshot: CloudSnapshot): Promise<void> {
  const existing = await fetchSnapshot(userId);
  if (existing) return;
  await pushSnapshot(userId, snapshot);
}
