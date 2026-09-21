import { useId, type CSSProperties } from 'react';
import type { MacroKind } from '../data';
import { DELKOL_MARK_PATH } from '../brand';

export type DepthIconKind = MacroKind | 'folder' | 'workspace' | 'config';

type DepthIconProps = {
  kind: DepthIconKind;
  size?: number;
  className?: string;
  style?: CSSProperties;
};

const TONES: Record<DepthIconKind, string> = {
  workspace: '#A7C5FF', folder: '#b2b6cd', config: '#A3ACE5',
  fishing: '#8ED6E5', racing: '#9AD9BD', cafe: '#EDC995', quests: '#B5D79A', artifacts: '#b8bed9',
};

export function DepthIcon({ kind, size = 24, className = '', style }: DepthIconProps) {
  const id = `item-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const front = `url(#${id}-front)`;
  const side = `url(#${id}-side)`;
  const gold = `url(#${id}-gold)`;
  const ivory = `url(#${id}-ivory)`;
  const crystal = `url(#${id}-crystal)`;
  const iconStyle: CSSProperties = { ...(kind === 'folder' ? {} : { color: TONES[kind] }), ...style };

  return <svg className={`depth-icon fantasy-icon depth-${kind} ${className}`} width={size} height={size} viewBox="0 0 48 48" fill="none" style={iconStyle} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-front`} x1="12" y1="6" x2="34" y2="43" gradientUnits="userSpaceOnUse"><stop stopColor="#F3F7ED" /><stop offset=".3" stopColor="currentColor" /><stop offset=".66" stopColor="currentColor" /><stop offset="1" stopColor="#505278" /></linearGradient>
      <linearGradient id={`${id}-side`} x1="8" y1="9" x2="35" y2="44" gradientUnits="userSpaceOnUse"><stop stopColor="currentColor" /><stop offset=".45" stopColor="#617A8D" /><stop offset="1" stopColor="#34354E" /></linearGradient>
      <linearGradient id={`${id}-gold`} x1="10" y1="6" x2="35" y2="43" gradientUnits="userSpaceOnUse"><stop stopColor="#FFF3CE" /><stop offset=".27" stopColor="#E8CF99" /><stop offset=".54" stopColor="#BA945D" /><stop offset=".74" stopColor="#EDCE95" /><stop offset="1" stopColor="#90734E" /></linearGradient>
      <linearGradient id={`${id}-ivory`} x1="13" y1="7" x2="35" y2="39" gradientUnits="userSpaceOnUse"><stop stopColor="#FFFAE9" /><stop offset=".44" stopColor="#EEE9D8" /><stop offset="1" stopColor="#adaeb6" /></linearGradient>
      <linearGradient id={`${id}-crystal`} x1="15" y1="7" x2="34" y2="39" gradientUnits="userSpaceOnUse"><stop stopColor="#EBFAFF" /><stop offset=".3" stopColor="#AFE7F1" /><stop offset=".62" stopColor="currentColor" /><stop offset="1" stopColor="#7c83a5" /></linearGradient>
    </defs>
    <ellipse className="fantasy-ground" cx="24" cy="43" rx={kind === 'fishing' ? 15 : 13} ry="2" fill="#10101B" opacity=".2" />

    {kind === 'workspace' && <g className="depth-wish-star">
      <path d="m24 4 6.5 13.5L44 24l-13.5 6.5L24 45l-6.5-14.5L4 24l13.5-6.5L24 4Z" fill={side} />
      <path d="m24 2 6.1 14.9L45 23l-14.9 6.1L24 44l-6.1-14.9L3 23l14.9-6.1L24 2Z" fill={gold} stroke="#F9E7BC" strokeWidth=".65" />
      <path d="m24 5 5.2 12.8L42 23l-12.8 5.2L24 41l-5.2-12.8L6 23l12.8-5.2L24 5Z" fill={crystal} />
      <path d="M24 5v18L6 23l12.8-5.2L24 5Z" fill="#F7FFFF" opacity=".7" />
      <path d="M24 23v18l5.2-12.8L42 23H24Z" fill="#747a9a" opacity=".45" />
      <path d="m24 13 10 10-10 10-10-10 10-10Z" fill={crystal} stroke="#ecedf3" strokeWidth=".55" />
      <path d="m24 13 1.8 9.2L34 23l-10 1-10-1 8.3-.8L24 13Z" fill="#FFFFFF" opacity=".45" />
      <path d={DELKOL_MARK_PATH} transform="translate(18.1 17.15) scale(.011)" fill="#f8f8fb" fillRule="evenodd" opacity=".95" />
      <path className="fantasy-glint" d="m38 7 .9 3.1L42 11l-3.1.9L38 15l-.9-3.1L34 11l3.1-.9L38 7Z" fill="#FFF4D9" />
      <path d="m11 33 .6 2.4 2.4.6-2.4.6L11 39l-.6-2.4L8 36l2.4-.6L11 33Z" fill="#D7E2FA" opacity=".8" />
    </g>}

    {kind === 'folder' && <>
      <path d="M7 12a3 3 0 0 1 3-3h9l5 5h15a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V12Z" fill={side} stroke={gold} strokeWidth="1.15" />
      <path d="M9 12h9l5 5h17" stroke="#F5E6C0" strokeOpacity=".46" strokeWidth=".9" />
      <g className="depth-folder-paper"><path d="M11 17h26v18H11V17Z" fill={ivory} /><path d="M14 20h19M14 22.5h13" stroke="#9e9fa8" strokeWidth=".8" opacity=".6" /></g>
      <g className="depth-folder-front"><path d="M7 22h34a2 2 0 0 1 1.9 2.5l-3.2 13A3 3 0 0 1 36.8 40H10.7a3 3 0 0 1-2.9-2.5L5.1 24.4A2 2 0 0 1 7 22Z" fill={front} stroke={gold} strokeWidth="1.2" /><path d="M8.5 24.5h30.8l-2.6 12.9H11l-2.5-12.9Z" stroke="#F8EFD4" strokeOpacity=".4" strokeWidth=".65" /><path d="m24 26 5 5-5 5-5-5 5-5Z" fill={gold} /><path d="m24 28 3 3-3 3-3-3 3-3Z" fill={side} /><path d="M10 23.5h4m21 0h4M10 37h3m21 0h3" stroke="#FFF5D8" strokeWidth="1.1" strokeLinecap="round" /></g>
    </>}

    {kind === 'fishing' && <g transform="rotate(-12 24 24)">
      <path className="depth-fish-tail" d="M17 25C10 23 5 17 4 12c-2 11-1 18 4 25 2-6 6-9 9-12Z" fill={front} stroke="#DCECD4" strokeWidth=".7" />
      <path d="M20 16c1-6 7-10 13-9l-1 8M18 31c2 6 8 9 15 6l-2-7" fill={ivory} stroke={gold} strokeWidth=".6" />
      <path d="M12 25c3-8 10-12 17-12s12 4 15 12c-4 7-9 10-16 10-8 0-12-3-16-10Z" fill={side} />
      <path d="M12 23c3-8 10-12 17-12s12 4 15 12c-4 7-9 10-16 10-8 0-12-3-16-10Z" fill={front} stroke="#DAECDD" strokeWidth=".85" />
      <path d="M15 22c8 1 12 7 22 5-7 8-16 5-22-5Z" fill={ivory} opacity=".77" />
      <path d="M31 13c-5 4-6 12-1 17" stroke={gold} strokeWidth="1.5" />
      <path d="M18 20c1-2 3-2 4 0m0-3c1-2 3-2 4 0m-4 7c1-2 3-2 4 0" stroke="#EFFBF2" strokeOpacity=".5" strokeWidth=".7" strokeLinecap="round" />
      <path d="m23 23-7 6 10-2" fill={gold} /><circle cx="37" cy="21" r="1.65" fill="#33434F" /><circle cx="37.5" cy="20.5" r=".55" fill="#FEFFF4" />
      <path d="M15 18c6-6 13-6 18-4" stroke="#F6FFF8" strokeOpacity=".63" strokeWidth=".9" strokeLinecap="round" />
    </g>}

    {kind === 'racing' && <>
      <path d="M11 41h7" stroke={gold} strokeWidth="2.4" strokeLinecap="round" /><path d="M14 8v32" stroke={gold} strokeWidth="3" strokeLinecap="round" /><path d="M13 10v29" stroke="#FFF1D4" strokeWidth=".75" />
      <path d="m14 3 3 4-3 4-3-4 3-4Z" fill={gold} />
      <g className="depth-flag"><path d="M16 10c8-5 14 5 26-1l-3 10 3 9c-11 6-20-6-26-1V10Z" fill={side} stroke={gold} strokeWidth=".9" /><path d="M16 9c8-5 14 5 26-1l-3 10 3 9c-11 6-20-6-26-1V9Z" fill={front} stroke={gold} strokeWidth="1" /><path d="M18 11c7-3 14 5 21 0m-21 12c7-3 14 5 21 1" stroke="#FFF2CA" strokeWidth=".8" strokeOpacity=".7" /><path d="m21 13 5 4 10-1-8 4-2 4-1-5-4-6Z" fill={ivory} /><path d="m22 17 4 2 6-1-6 4" fill="#FFEDD0" opacity=".85" /></g>
      <path d="M5 28c3 2 4 4 4 8m-5-4 5 4 2-5" stroke={gold} strokeWidth=".9" strokeLinecap="round" strokeLinejoin="round" />
    </>}

    {kind === 'cafe' && <>
      <g className="depth-steam" stroke="#F5DEC3" strokeWidth="1.15" strokeLinecap="round" opacity=".65"><path d="M16 11c-4-3 4-4 0-7" /><path d="M23 10c-4-3 4-4 0-7" /><path d="M29 11c-4-3 4-4 0-7" /></g>
      <ellipse cx="23" cy="39" rx="17" ry="3.2" fill={side} stroke={gold} strokeWidth="1" /><ellipse cx="23" cy="38" rx="14.5" ry="2" fill={ivory} />
      <path d="M35 18h3.5a6.5 6.5 0 0 1 0 13H34" stroke={gold} strokeWidth="3.1" /><path d="M36 18.2h2.5a6 6 0 0 1 4.3 1.8" stroke="#FFF6E0" strokeWidth="1" strokeLinecap="round" />
      <path d="M10 16h25l-2 15a9 9 0 0 1-8.8 7h-3.4a9 9 0 0 1-8.8-7l-2-15Z" fill={ivory} stroke={gold} strokeWidth="1.1" />
      <path d="M30 19h4l-1.5 11c-1 4-3 6-7 7l4.5-18Z" fill="#9b9da9" opacity=".24" />
      <ellipse cx="22.5" cy="16" rx="12.5" ry="3.5" fill={gold} /><ellipse cx="22.5" cy="16" rx="10.5" ry="2.2" fill="#786054" /><path d="M16 16c3-2 7-2 11-.5" stroke="#EED8B7" strokeWidth=".7" strokeLinecap="round" />
      <path d="M13 28c4 3 15 3 19 0M15 33c4 2 11 2 15 0" stroke={gold} strokeWidth="1" /><path d="m23 21 4 5-4 5-4-5 4-5Z" fill={gold} /><path d="m23 23 2 3-2 3-2-3 2-3Z" fill={front} />
      <path d="M13 21v3" stroke="#FFFFFF" strokeOpacity=".8" strokeWidth="1.4" strokeLinecap="round" />
    </>}

    {kind === 'quests' && <>
      <path d="M10 8h25l3 29-24 3L10 8Z" fill={side} />
      <path d="M11 7h24v27c0 3 2 4 5 4H15a5 5 0 0 1-5-5V12l1-5Z" fill={ivory} stroke={gold} strokeWidth=".9" />
      <path d="M9 7h26a4 4 0 0 1 4 4v2h-6v-2c0-2-2-3-4-3H10" fill={gold} /><path d="M9 7c3 0 4 2 4 4v2H6v-2c0-2 1-4 3-4Z" fill={ivory} stroke={gold} strokeWidth=".65" />
      <path d="M17 15h12M17 19h12M17 23h8" stroke="#9C93A1" strokeOpacity=".8" strokeWidth="1" strokeLinecap="round" />
      <path d="M13 33h17c0 3 2 5 5 5H14c-3 0-4-2-4-4v-1h3Z" fill={gold} opacity=".65" />
      <path d="m31 30-3 13 5-3 5 3-3-13" fill={side} stroke={gold} strokeWidth=".6" />
      <g className="depth-star"><path d="m33 24 3 2 3 1v4l-2 3-4 2-4-2-2-3v-4l3-1 3-2Z" fill={front} stroke={gold} strokeWidth="1" /><path d="m33 27 3 3-3 3-3-3 3-3Z" fill={ivory} /></g>
      <path className="depth-twinkle fantasy-glint" d="m41 4 .8 2.2L44 7l-2.2.8L41 10l-.8-2.2L38 7l2.2-.8L41 4Z" fill="#F8E6BF" />
    </>}

    {kind === 'artifacts' && <>
      <path d="m16 8 16-1 9 14-15 24L7 23l9-15Z" fill={side} />
      <path d="m15 6 17 1 9 13-16 23L7 21l8-15Z" fill={gold} stroke="#EEDABA" strokeWidth=".75" />
      <path d="m16 8 15 1 7 11-13 20L10 21l6-13Z" fill={crystal} />
      <path d="m16 8 3 12-9 1 6-13Z" fill="#E7FAFF" opacity=".85" /><path d="m31 9-2 12 9-1-7-11Z" fill="#eeeff6" opacity=".75" />
      <path d="m16 8 8 5 7-4-2 12-10-1-3-12Z" fill="currentColor" /><path d="m19 20 6 20 4-19-10-1Z" fill="#ced2e5" /><path d="m29 21-4 19 13-20-9 1Z" fill="#747b9e" opacity=".75" />
      <path d="m10 21 9-1 6 20M19 20l5-7 5 8 9-1" stroke="#f5f6fa" strokeWidth=".6" strokeOpacity=".75" />
      <path d="m10 22 5 6m19-17 4 6M21 37l4 5 4-6" stroke={gold} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path className="fantasy-glint" d="m37 1 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z" fill="#FFF1D3" />
    </>}

    {kind === 'config' && <g className="depth-spellbook">
      <path d="m9 10 25-5 7 5v29l-27 5-5-5V10Z" fill={side} stroke={gold} strokeWidth=".75" />
      <path d="m13 13 26-5v28l-26 5V13Z" fill={ivory} /><path d="m15 15 22-4m-22 27 22-4m-22 5 22-4" stroke="#AEA1AF" strokeWidth=".8" opacity=".7" />
      <path d="m8 8 24-4 7 4-25 5-6-5Z" fill={gold} /><path d="m8 8 25-4v31L8 40V8Z" fill={front} stroke={gold} strokeWidth="1.05" />
      <path d="m11 11 19-3v24l-19 4V11Z" stroke="#F4DEB4" strokeWidth=".65" opacity=".75" />
      <path d="M8 8v32l4-1V7.4L8 8Z" fill={side} opacity=".7" /><path d="m8.5 15 3-.5m-3 15 3-.5" stroke={gold} strokeWidth="1.4" />
      <path d="m22 13 2.6 5.4L30 20l-5.4 2.6L22 29l-2.6-5.4L14 22l5.4-2.6L22 13Z" fill={gold} /><path d="m22 17 4 4-4 5-4-4 4-5Z" fill={crystal} /><path d="m22 17-1 4 1 5-4-4 4-5Z" fill="#F4FCFF" opacity=".66" />
      <path d="m27 37 5-1v8l-2-1-3 2v-8Z" fill={gold} /><path d="M31 7v3m-3-2h3M14 32l-2 .5v-3" stroke="#FFF4D8" strokeWidth="1.1" strokeLinecap="round" />
    </g>}
  </svg>;
}