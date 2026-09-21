import { assetUrl } from './paths';

/**
 * Shared avatar catalog.
 *
 * avatar-01..218 — curated Pinterest-style art (portrait, square, anime/pfp mix).
 * The custom "Новый проект" set (formerly avatar-219..232) has been repurposed
 * as avatar frames — see public/images/frames and src/data.ts FRAME_CATALOG.
 *
 * Every account without an uploaded photo gets one, picked by a stable hash of
 * its handle: the same user always sees the same picture, on every device.
 */

const CATALOG: string[] = Array.from({ length: 218 }, (_, i) =>
  assetUrl(`/images/avatars/avatar-${String(i + 1).padStart(2, '0')}.jpg`));

export const AVATAR_CATALOG: readonly string[] = CATALOG;

export const AVATAR_COUNT = CATALOG.length;

/** Stable FNV-1a hash → same handle always maps to the same art. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Catalog art for a handle. External URLs (DiceBear, uploads) pass through —
 * only bare handles resolve into the bundled catalog.
 */
export function catalogAvatar(handle: string): string {
  return CATALOG[hash(handle || 'delkol') % CATALOG.length];
}

/** True when the value points at the bundled catalog rather than an upload. */
export function isCatalogAvatar(url: string): boolean {
  return url.includes('/images/avatars/avatar-');
}
