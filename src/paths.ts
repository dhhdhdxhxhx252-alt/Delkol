/**
 * Asset base resolution for web + Electron.
 *
 * In the browser the app is served at "/", so "/images/x.jpg" works as-is.
 * In packaged Electron the app is loaded via file://, where absolute paths
 * break (they resolve to the drive root) — images would fall back to alt
 * text. Vite gives us import.meta.env.BASE_URL which is "./" in both builds;
 * joining against it keeps every asset relative in Electron and unchanged
 * in the browser.
 */

const BASE = import.meta.env.BASE_URL || '/';

export function assetUrl(path: string): string {
  if (/^(data:|https?:)/.test(path)) return path;
  if (!path.startsWith('/')) return path;
  return BASE.endsWith('/') ? `${BASE}${path.slice(1)}` : `${BASE}${path}`;
}
