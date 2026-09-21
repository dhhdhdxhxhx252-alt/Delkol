/**
 * Settings → «Оптимизация»: real system stats for the desktop build.
 *
 * Data comes from the Electron main process (electron/main.cjs):
 *   system:info      — drives, RAM, CPU, temp-folder size
 *   system:bigItems  — largest installed folders (with drive roots nearby)
 *   system:tempClean — wipe the user temp folder
 *   system:gameClean — wipe NTE/WWM cache & log folders
 *
 * In the plain web build (no window.delkol bridge) the panel degrades to a
 * friendly explanation instead of fake numbers.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Cpu, Download, Folder, HardDrive, LoaderCircle, MemoryStick, Play, RefreshCw, ShieldCheck, Sparkles, Trash2, Upload, Wifi } from 'lucide-react';
import type { BigItem, SystemInfo } from '../desktop';

type OptimizeNotify = (text: string, type?: 'success' | 'info' | 'warning') => void;

function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  const power = Math.min(Math.floor(Math.log10(bytes) / 3), units.length - 1);
  const value = bytes / 1000 ** power;
  return `${value.toFixed(power === 0 ? 0 : digits).replace('.', ',')} ${units[power]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days} д ${hours} ч`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours} ч ${minutes} мин`;
}

/** Generic icon for an installed folder — real .exe icons are not accessible
 *  from the sandboxed renderer, so folders get a neutral glyph + size badge. */
function folderGlyph(name: string): string {
  const lower = name.toLowerCase();
  if (/(steam|epic|game|nte|wwm|winds)/.test(lower)) return '🎮';
  if (/(adobe|photoshop|premiere|blender|davinci)/.test(lower)) return '🎨';
  if (/(chrome|firefox|browser|opera|brave)/.test(lower)) return '🌐';
  if (/(discord|telegram|whatsapp|viber)/.test(lower)) return '💬';
  if (/(code|studio|jetbrains|idea)/.test(lower)) return '💻';
  return '📦';
}

export function OptimizePanel({ onNotify }: { onNotify: OptimizeNotify }) {
  const bridge = window.delkol;
  const available = !!bridge?.systemInfo;

  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [bigItems, setBigItems] = useState<BigItem[] | null>(null);
  const [speed, setSpeed] = useState<{ down: number; up: number } | null>(null);
  const [speedBusy, setSpeedBusy] = useState(false);
  const [cleanBusy, setCleanBusy] = useState<'temp' | 'game' | null>(null);
  const [tempFreed, setTempFreed] = useState<number | null>(null);
  const [gameFreed, setGameFreed] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  // Progress bars: percent 0..100 + what is being processed right now.
  const [cleanProgress, setCleanProgress] = useState<{ percent: number; detail: string } | null>(null);
  const [scanProgress, setScanProgress] = useState<{ percent: number; detail: string } | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  // Wire the main-process progress streams (Electron only).
  useEffect(() => {
    const offTemp = bridge?.onTempCleanProgress?.((percent, detail) => {
      if (aliveRef.current) setCleanProgress({ percent, detail });
    });
    const offScan = bridge?.onBigItemsProgress?.((percent, detail) => {
      if (aliveRef.current) setScanProgress({ percent, detail });
    });
    return () => { offTemp?.(); offScan?.(); };
  }, [bridge]);

  const refresh = useCallback(async () => {
    if (!bridge?.systemInfo) return;
    setScanning(true);
    setScanProgress({ percent: 0, detail: 'Подготовка…' });
    try {
      const fresh = await bridge.systemInfo();
      if (aliveRef.current) setInfo(fresh);
      if (bridge.systemBigItems) {
        const items = await bridge.systemBigItems();
        if (aliveRef.current) setBigItems(items);
      }
    } catch {
      if (aliveRef.current) onNotify('Не удалось получить данные о системе.', 'warning');
    } finally {
      if (aliveRef.current) { setScanning(false); setScanProgress(null); }
    }
  }, [bridge, onNotify]);

  useEffect(() => {
    if (available) void refresh();
  }, [available, refresh]);

  const measureSpeed = useCallback(async () => {
    if (speedBusy) return;
    setSpeedBusy(true);
    setSpeed(null);
    try {
      // Download: fetch a random cache-busting payload from the local Supabase
      // storage endpoint family; any public CDN works too. We use cloudflare's
      // speed test endpoint — CORS-friendly and stable.
      const testUrl = 'https://speed.cloudflare.com/__down?bytes=5000000';
      const started = performance.now();
      const response = await fetch(testUrl, { cache: 'no-store' });
      const blob = await response.blob();
      const seconds = (performance.now() - started) / 1000;
      const downMbps = (blob.size * 8) / seconds / 1_000_000;
      // Upload: cloudflare echo endpoint.
      let upMbps = 0;
      try {
        const payload = new Blob([new Uint8Array(1_000_000)]);
        const upStart = performance.now();
        await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: payload, cache: 'no-store' });
        const upSeconds = (performance.now() - upStart) / 1000;
        upMbps = (1_000_000 * 8) / upSeconds / 1_000_000;
      } catch { /* upload measurement optional */ }
      if (aliveRef.current) setSpeed({ down: downMbps, up: upMbps });
    } catch {
      if (aliveRef.current) onNotify('Не удалось измерить скорость — проверьте интернет.', 'warning');
    } finally {
      if (aliveRef.current) setSpeedBusy(false);
    }
  }, [speedBusy, onNotify]);

  const cleanTemp = useCallback(async () => {
    if (!bridge?.systemTempClean || cleanBusy) return;
    setCleanBusy('temp');
    setCleanProgress({ percent: 0, detail: 'Подготовка…' });
    try {
      const result = await bridge.systemTempClean();
      setTempFreed(result.freed);
      onNotify(result.freed > 0 ? `Очистка завершена: освобождено ${formatBytes(result.freed)}.` : 'Временных файлов почти нет — всё чисто.', result.freed > 0 ? 'success' : 'info');
      void refresh();
    } catch {
      onNotify('Не удалось очистить временные файлы.', 'warning');
    } finally {
      setCleanBusy(null);
      setCleanProgress(null);
    }
  }, [bridge, cleanBusy, onNotify, refresh]);

  const cleanGame = useCallback(async () => {
    if (!bridge?.systemGameClean || cleanBusy) return;
    setCleanBusy('game');
    try {
      const result = await bridge.systemGameClean();
      setGameFreed(result.freed);
      onNotify(result.found.length
        ? result.freed > 0 ? `NTE найдена (${result.found.length} пап.): освобождено ${formatBytes(result.freed)}.` : 'Кэш NTE уже чистый.'
        : 'Папки NTE не найдены на этом ПК.', result.found.length ? 'success' : 'info');
      void refresh();
    } catch {
      onNotify('Не удалось выполнить оптимизацию NTE.', 'warning');
    } finally {
      setCleanBusy(null);
    }
  }, [bridge, cleanBusy, onNotify, refresh]);

  if (!available) {
    return <div className="optimize-wrap">
      <div className="optimize-unavailable">
        <ShieldCheck size={26} strokeWidth={1.3} />
        <h3>Оптимизация доступна в приложении</h3>
        <p>Данные о дисках, памяти и скорости интернета читаются напрямую из системы.
          Запустите настольную версию {`Delkol`} — здесь, в браузере, эти данные недоступны по соображениям безопасности.</p>
      </div>
    </div>;
  }

  const memory = info?.memory;
  const usedShare = memory && memory.total > 0 ? 1 - memory.free / memory.total : 0;

  return <div className="optimize-wrap">
    <div className="preferences-section-heading">
      <div>
        <h2>Состояние системы</h2>
        <p>Реальные данные вашего ПК. Нажмите «Сканировать», чтобы обновить.</p>
      </div>
      <button className="button button-secondary" disabled={scanning} onClick={() => void refresh()}>
        {scanning ? <LoaderCircle size={14} className="spin-icon" /> : <RefreshCw size={14} />}
        {scanning ? 'Сканируем…' : 'Сканировать'}
      </button>
    </div>

    <div className="optimize-grid">
      {info?.drives.map((drive) => {
        const used = Math.max(0, drive.total - drive.free);
        const share = drive.total > 0 ? used / drive.total : 0;
        return <div className="optimize-card" key={drive.root}>
          <span className="optimize-card-label"><HardDrive size={13} />Диск {drive.root}</span>
          <strong>{formatBytes(drive.free, 0)}<em>свободно из {formatBytes(drive.total, 0)}</em></strong>
          <div className="optimize-bar"><i style={{ width: `${Math.round(share * 100)}%` }} className={share > 0.9 ? 'critical' : share > 0.75 ? 'warn' : ''} /></div>
          <small>Занято {Math.round(share * 100)}% · {formatBytes(used, 0)}</small>
        </div>;
      })}

      {memory && <div className="optimize-card">
        <span className="optimize-card-label"><MemoryStick size={13} />Оперативная память</span>
        <strong>{formatBytes(memory.total - memory.free, 0)}<em>из {formatBytes(memory.total, 0)}</em></strong>
        <div className="optimize-bar"><i style={{ width: `${Math.round(usedShare * 100)}%` }} className={usedShare > 0.9 ? 'critical' : usedShare > 0.75 ? 'warn' : ''} /></div>
        <small>Занято {Math.round(usedShare * 100)}% · свободно {formatBytes(memory.free, 0)}</small>
      </div>}

      {info?.cpu && <div className="optimize-card">
        <span className="optimize-card-label"><Cpu size={13} />Процессор</span>
        <strong className="optimize-text-value">{info.cpu.cores}<em>ядра · {info.cpu.model.slice(0, 34) || 'CPU'}</em></strong>
        <small>Время работы системы: {formatUptime(info.uptime)}</small>
      </div>}

      <div className="optimize-card">
        <span className="optimize-card-label"><Wifi size={13} />Скорость интернета</span>
        {speed
          ? <strong className="optimize-text-value">
              {speed.down.toFixed(1).replace('.', ',')}<em>Мбит/с ↓ {speed.up > 0 ? `· ${speed.up.toFixed(1).replace('.', ',')} Мбит/с ↑` : ''}</em>
            </strong>
          : <strong className="optimize-text-value optimize-dim"><em>{speedBusy ? 'Измеряем…' : 'Ещё не измеряли'}</em></strong>}
        <button className="button button-secondary optimize-inline-btn" disabled={speedBusy} onClick={() => void measureSpeed()}>
          {speedBusy ? <LoaderCircle size={12} className="spin-icon" /> : <Download size={12} />}
          {speedBusy ? 'Тест идёт…' : speed ? 'Повторить тест' : 'Измерить скорость'}
        </button>
        {speed && speed.up > 0 && <div className="optimize-speed-rows"><span><Upload size={11} />Отдача: {speed.up.toFixed(1).replace('.', ',')} Мбит/с</span></div>}
      </div>

      <div className="optimize-card">
        <span className="optimize-card-label"><Trash2 size={13} />Временные файлы</span>
        <strong className="optimize-text-value">{info ? formatBytes(info.tempSize) : '—'}<em>во временной папке</em></strong>
        {cleanBusy === 'temp' && cleanProgress
          ? <div className="optimize-progress" role="progressbar" aria-valuenow={cleanProgress.percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="optimize-bar"><i style={{ width: `${cleanProgress.percent}%` }} /></div>
              <small className="optimize-progress-caption"><b>{cleanProgress.percent}%</b><span title={cleanProgress.detail}>{cleanProgress.detail}</span></small>
            </div>
          : <button className="button button-primary optimize-inline-btn" disabled={cleanBusy !== null || !info} onClick={() => void cleanTemp()}>
              {cleanBusy === 'temp' ? <LoaderCircle size={12} className="spin-icon" /> : <Sparkles size={12} />}
              {cleanBusy === 'temp' ? 'Очищаем…' : 'Очистить сейчас'}
            </button>}
        {tempFreed !== null && cleanBusy !== 'temp' && <small className="optimize-result-ok">Освобождено {formatBytes(tempFreed)}</small>}
      </div>
    </div>

    <div className="preferences-section-heading optimize-section-gap">
      <div>
        <h2>Самые большие приложения и папки</h2>
        <p>Топ папок с установками — рядом указан путь, чтобы вы всегда знали, где место.</p>
      </div>
      <Folder size={20} strokeWidth={1.3} />
    </div>
    <div className="optimize-big-list">
      {bigItems === null && <div className="community-loading optimize-scan-progress">
        <LoaderCircle size={20} className="spin-icon" />
        <span>Сканируем большие папки… это может занять минуту.</span>
        {scanProgress && <div className="optimize-progress optimize-progress-wide" role="progressbar" aria-valuenow={scanProgress.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="optimize-bar"><i style={{ width: `${scanProgress.percent}%` }} /></div>
          <small className="optimize-progress-caption"><b>{scanProgress.percent}%</b><span title={scanProgress.detail}>{scanProgress.detail}</span></small>
        </div>}
      </div>}
      {bigItems?.map((item) => <div className="optimize-big-row" key={item.path} title={item.path}>
        <span className="optimize-big-glyph" aria-hidden="true">{folderGlyph(item.name)}</span>
        <span className="optimize-big-copy"><strong>{item.name}</strong><small>{item.path}</small></span>
        <span className="optimize-big-size">{formatBytes(item.size)}</span>
      </div>)}
      {bigItems?.length === 0 && <p className="optimize-empty-note">Крупные папки не найдены — система в отличной форме.</p>}
    </div>

    <div className="preferences-section-heading optimize-section-gap">
      <div>
        <h2>Оптимизация игры NTE</h2>
        <p>Очистка кэша, шейдеров и логов NTE (Where Winds Meet) — игра соберёт их заново, часто это лечит фризы и долгие загрузки.</p>
      </div>
      <Play size={20} strokeWidth={1.3} />
    </div>
    <div className="optimize-game-card">
      <div className="optimize-game-copy">
        <strong>Очистить кэш и логи NTE</strong>
        <p>Ищем папки NTE / Where Winds Meet в Program Files, AppData и Документах. Удаляются только подпапки cache, logs и ShaderCache — сами настройки и сохранения не трогаются.</p>
        {gameFreed !== null && <small className="optimize-result-ok">В прошлый раз освобождено {formatBytes(gameFreed)}</small>}
      </div>
      <button className="button button-primary" disabled={cleanBusy !== null} onClick={() => void cleanGame()}>
        {cleanBusy === 'game' ? <LoaderCircle size={13} className="spin-icon" /> : <Sparkles size={13} />}
        {cleanBusy === 'game' ? 'Оптимизируем…' : 'Оптимизировать NTE'}
      </button>
    </div>
  </div>;
}
