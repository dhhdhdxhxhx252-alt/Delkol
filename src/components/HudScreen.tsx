/**
 * HUD screen — отдельное прозрачное Electron-окно, висящее СНАРУЖИ приложения
 * (NotchNook-стиль): чёрная пилюля с кольцевыми датчиками и процентами.
 *
 * Данные приходят из главного окна через hud:state (IPC push):
 *   { macros: [{ id, name, kind, percent, phase }], session: { running, elapsed, cycles } }
 * Шестерёнка открывает настройки приложения. Окно не крадёт фокус у игры.
 */
import { useEffect, useState } from 'react';
import { Coins, Fish, Palette, ScrollText, Settings, Swords } from 'lucide-react';
import '../styles/hud.css'; // применяется только при html[data-window='hud']

type HudMacro = { id: string; name: string; kind: string; percent: number; phase: string; group?: string; groupColor?: string };

type HudPayload = {
  macros: HudMacro[];
  session: { running: boolean; elapsed: number; cycles: number };
};

type HudBridge = {
  onHudState?: (callback: (payload: HudPayload) => void) => () => void;
  openSettings?: () => void;
};

const KIND_ICON: Record<string, typeof Fish> = {
  fishing: Fish,
  racing: Swords,
  cafe: Coins,
  quests: ScrollText,
  artifacts: Palette,
};

const PHASE_TONE: Record<string, string> = {
  running: 'ok',
  waiting: 'mid',
  break: 'mid',
  retry: 'hot',
  paused: 'mid',
  stopped: 'hot',
};

function RingGauge({ percent, tone, icon: Icon, group, groupColor }: { percent: number; tone: string; icon: typeof Fish; group?: string; groupColor?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return <>
    <div className={`hud2-gauge tone-${tone}`}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="hud2-track" cx="20" cy="20" r="17" />
        <circle className="hud2-arc" cx="20" cy="20" r="17" strokeDasharray={`${(clamped / 100) * 92} 107`} />
      </svg>
      <Icon className="hud2-glyph" strokeWidth={1.1} aria-hidden="true" />
    </div>
    <span className="hud2-percent">{clamped}%</span>
    {group && <span className="hud2-group" title={group} style={groupColor ? { color: groupColor } : undefined}><i style={{ background: groupColor || '#8f95b1' }} />{group}</span>}
  </>;
}

export function HudScreen() {
  const bridge = (window as unknown as { delkol?: HudBridge }).delkol;
  const [payload, setPayload] = useState<HudPayload | null>(null);

  useEffect(() => {
    if (!bridge?.onHudState) return;
    const off = bridge.onHudState((next) => setPayload(next));
    return () => off?.();
  }, [bridge]);

  const macros = payload?.macros ?? [];
  const tone = (macro: HudMacro) => PHASE_TONE[macro.phase] ?? 'mid';

  return <div className="hud2-root">
    <div className="hud2-pill" role="status" aria-label="HUD макросов">
      {macros.length === 0 && <div className="hud2-empty">
        <div className="hud2-empty-ring"><Fish className="hud2-glyph" strokeWidth={1.2} /></div>
        <span className="hud2-percent">—</span>
      </div>}
      {/* RingGauge теперь рендерит кольцо + процент двумя элементами: gap пилюли
          держит воздух между ними, процент физически ВНЕ круга */}
      {macros.map((macro) => {
        const Icon = KIND_ICON[macro.kind] ?? Fish;
        return <div className="hud2-item" key={macro.id} title={macro.name}>
          <RingGauge percent={macro.percent} tone={tone(macro)} icon={Icon} group={macro.group} groupColor={macro.groupColor} />
        </div>;
      })}
      <button className="hud2-gear" aria-label="Настройки HUD" title="Настройки" onClick={() => bridge?.openSettings?.()}>
        <Settings size={15} strokeWidth={1.5} />
      </button>
    </div>
  </div>;
}

// Экспортируется для main.tsx; рендерится только в ?window=hud.
