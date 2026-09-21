import { useId } from 'react';
import { assetUrl } from '../paths';
import { FRAME_CATALOG } from '../data';

/** Frame id → PNG overlay path, from the single FRAME_CATALOG source. */
const FRAME_IMAGES: Record<string, string> = Object.fromEntries(
  FRAME_CATALOG.filter((frame) => frame.image).map((frame) => [frame.id, frame.image as string]),
);

/**
 * Avatar frames. `sakura` is vector-drawn (crisp at any size); every paid
 * frame is a 1080×1080 PNG overlay from public/images/frames, rendered on top
 * of the avatar (transparent center). See FRAME_CATALOG in src/data.ts.
 */
export function AvatarFrameArt({ frame, className = '' }: { frame: string; className?: string }) {
  if (frame === 'sakura') return <AvatarFrame className={className} />;
  const image = FRAME_IMAGES[frame];
  if (!image) return null;
  return <img src={assetUrl(image)} alt="" draggable={false} className={`avatar-frame ${className}`} />;
}

// Vector ornaments keep transparency crisp at any size and blend with the dark surfaces.
export function PanelFrame({ className = '' }: { className?: string }) {
  return <span className={`panel-frame ${className}`} aria-hidden="true">
    {[0, 1, 2, 3].map((corner) => <span key={corner}>
      <svg viewBox="0 0 44 44" fill="none" focusable="false">
        <path d="M2 26V9.5A7.5 7.5 0 0 1 9.5 2H27" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" opacity=".85" />
        <path d="M6.5 30V12a5.5 5.5 0 0 1 5.5-5.5h18" stroke="currentColor" strokeWidth=".7" strokeLinecap="round" opacity=".4" />
        <path d="m10 6.5 3.4 3.4L10 13.3 6.6 9.9 10 6.5Z" fill="currentColor" opacity=".9" />
        <path d="m10 8.6 1.3 1.3L10 11.2 8.7 9.9 10 8.6Z" fill="#17171A" opacity=".55" />
        <path d="M27 2.5h7M2.5 26v7" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" opacity=".28" />
        <circle cx="36.5" cy="2.5" r="1.15" fill="currentColor" opacity=".55" />
        <circle cx="2.5" cy="36.5" r="1.15" fill="currentColor" opacity=".55" />
      </svg>
    </span>)}
  </span>;
}

export function AvatarFrame({ className = '' }: { className?: string }) {
  const id = `sakura-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const petal = `url(#${id}-petal)`;
  const deep = `url(#${id}-deep)`;

  const Blossom = ({ x, y, size, tilt, tone = petal }: { x: number; y: number; size: number; tilt: number; tone?: string }) => (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${size / 10})`}>
      {[0, 72, 144, 216, 288].map((angle) => <g key={angle} transform={`rotate(${angle})`}>
        <path d="M0 0C3.4-1.4 6.4-3.6 6.6-6.6 6.8-9.4 3.6-11 1.2-9.6-.3-8.7-.6-6.8-1.4-5.2-2.2-3.6-3.4-2.2-3-.9-2.7.1-1.3.4 0 0Z" fill={tone} />
        <path d="M1 -2.2C2.4-3.4 4-5 4.4-6.6" stroke="#FFFFFF" strokeOpacity=".5" strokeWidth=".5" strokeLinecap="round" />
      </g>)}
      <circle r="2.1" fill="#FBE3EC" />
      {[10, 82, 154, 226, 298].map((angle) => <g key={angle} transform={`rotate(${angle})`}><path d="M0 0v-3.2" stroke="#B0304F" strokeWidth=".55" strokeLinecap="round" /><circle cy="-3.4" r=".72" fill="#8E1F3C" /></g>)}
    </g>
  );

  return <svg className={`avatar-frame ${className}`} viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${id}-petal`} cx=".35" cy=".3" r=".85"><stop stopColor="#FFF2F6" /><stop offset=".45" stopColor="#FBC5D6" /><stop offset="1" stopColor="#F28FB2" /></radialGradient>
      <radialGradient id={`${id}-deep`} cx=".4" cy=".3" r=".8"><stop stopColor="#FFDCE7" /><stop offset=".6" stopColor="#F6A6C2" /><stop offset="1" stopColor="#D9648F" /></radialGradient>
      <linearGradient id={`${id}-ring`} x1="14" y1="14" x2="86" y2="86"><stop stopColor="#F4F1F5" /><stop offset=".5" stopColor="#C9C3CE" /><stop offset="1" stopColor="#EDE7EE" /></linearGradient>
    </defs>
    <circle cx="50" cy="50" r="41" stroke={`url(#${id}-ring)`} strokeWidth="1.1" opacity=".85" />
    <circle cx="50" cy="50" r="37.5" stroke={`url(#${id}-ring)`} strokeWidth=".65" opacity=".55" />
    <g stroke="#C08FA4" strokeWidth=".62" strokeLinecap="round" opacity=".92" fill="none">
      <path d="M27 20c-4 5-7 11-8 17M23 24c-3 3-5 7-6 11M74 25c4 5 6 10 7 16M77 30c2 4 3 8 3 12M36 79c5 3 10 5 16 5M40 82c4 2 8 3 12 3" />
      <path d="M20 40c-2 5-2 9-1 14M84 46c1 5 0 10-2 14M60 84c5-1 9-3 13-6" />
    </g>
    <g fill="#C7899F">
      {[[24, 30], [20, 44], [30, 22], [78, 33], [82, 47], [72, 24], [44, 85], [56, 86], [36, 80], [70, 76], [26, 66], [79, 60]].map(([x, y], index) => <circle key={index} cx={x} cy={y} r={index % 3 === 0 ? 1.5 : 1} opacity={index % 2 ? .85 : .6} />)}
    </g>
    <g className="sakura-cluster">
      <Blossom x={20} y={26} size={13} tilt={-18} />
      <Blossom x={31} y={15} size={9} tilt={24} tone={deep} />
      <Blossom x={12} y={40} size={8} tilt={12} tone={deep} />
      <Blossom x={80} y={70} size={13} tilt={160} />
      <Blossom x={69} y={82} size={9} tilt={200} tone={deep} />
      <Blossom x={87} y={57} size={8} tilt={130} tone={deep} />
      <Blossom x={84} y={26} size={7} tilt={70} />
      <Blossom x={22} y={76} size={7} tilt={250} />
    </g>
    <g fill="#7FA07E" opacity=".75">
      <ellipse cx="14" cy="33" rx="3.4" ry="1.6" transform="rotate(-40 14 33)" />
      <ellipse cx="88" cy="64" rx="3.4" ry="1.6" transform="rotate(140 88 64)" />
      <ellipse cx="30" cy="83" rx="3" ry="1.4" transform="rotate(20 30 83)" />
    </g>
  </svg>;
}

export function CosmicAccent({ className = '' }: { className?: string }) {
  const id = `cosmic-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return <svg className={`cosmic-accent ${className}`} viewBox="0 0 690 290" fill="none" aria-hidden="true" focusable="false" preserveAspectRatio="xMinYMid meet">
    <defs>
      <radialGradient id={`${id}-planet`} cx=".36" cy=".3" r=".78"><stop stopColor="#CDA8FF" /><stop offset=".38" stopColor="#8E63E8" /><stop offset=".72" stopColor="#5B3BB4" /><stop offset="1" stopColor="#2E2064" /></radialGradient>
      <radialGradient id={`${id}-core`} cx=".5" cy=".5" r=".5"><stop stopColor="#FFF6FF" /><stop offset=".45" stopColor="#F0C8FF" stopOpacity=".65" /><stop offset="1" stopColor="#C79BFF" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${id}-halo`} cx=".5" cy=".5" r=".5"><stop stopColor="#9C7BFF" stopOpacity=".62" /><stop offset=".55" stopColor="#7E5AD8" stopOpacity=".22" /><stop offset="1" stopColor="#5B3BB4" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-ring`} x1="30" y1="150" x2="250" y2="120"><stop stopColor="#7FE6F5" /><stop offset=".45" stopColor="#63B8F0" /><stop offset="1" stopColor="#A97BF0" /></linearGradient>
      <linearGradient id={`${id}-wisp`} x1="250" y1="120" x2="660" y2="180"><stop stopColor="#C99BFF" /><stop offset=".5" stopColor="#B071E8" /><stop offset="1" stopColor="#E58AD8" stopOpacity=".15" /></linearGradient>
      <filter id={`${id}-soft`} x="-40%" y="-60%" width="180%" height="240%"><feGaussianBlur stdDeviation="9" /></filter>
      <filter id={`${id}-glow`} x="-50%" y="-70%" width="200%" height="260%"><feGaussianBlur stdDeviation="17" /></filter>
    </defs>

    <g className="cosmic-nebula" filter={`url(#${id}-soft)`} fill={`url(#${id}-wisp)`}>
      <path d="M235 132c60-22 118 6 176 2 44-3 78-26 118-24-30 16-44 44-78 56-46 16-92-8-136 4-30 8-56 26-88 22 4-24 4-52 8-60Z" opacity=".78" />
      <path d="M430 96c40-8 70 12 108 6-22 22-52 26-84 22-14-2-26-12-24-28Z" opacity=".5" />
      <path d="M300 190c52-14 96 16 148 6-30 26-72 30-116 20-18-4-32-12-32-26Z" opacity=".42" />
    </g>
    <ellipse className="cosmic-halo" cx="150" cy="146" rx="132" ry="104" fill={`url(#${id}-halo)`} filter={`url(#${id}-glow)`} />
    <path d="M28 128c44-42 118-52 186-30 40 13 66 33 74 52-38-16-84-22-132-14-52 8-96 26-128 48-8-20-6-40 0-56Z" fill="#6E4CD0" opacity=".35" filter={`url(#${id}-soft)`} />

    <path d="M40 158c26 22 68 34 112 30 46-4 82-24 100-48" stroke={`url(#${id}-ring)`} strokeWidth="17" strokeLinecap="round" opacity=".92" />
    <circle cx="150" cy="146" r="82" fill={`url(#${id}-planet)`} />
    <ellipse cx="150" cy="140" rx="46" ry="34" fill={`url(#${id}-core)`} transform="rotate(-18 150 140)" />
    <g fill="#FFFFFF">
      {[[112, 104, 2.6], [178, 96, 2], [96, 168, 2.2], [188, 176, 2.4], [148, 200, 1.8], [206, 138, 1.6], [122, 138, 1.4], [166, 158, 1.9]].map(([x, y, r], index) => <circle key={index} cx={x} cy={y} r={r} opacity={index % 2 ? .85 : .55} />)}
    </g>
    <path d="M74 106c-16 26-18 62-4 90" stroke="#FFFFFF" strokeOpacity=".2" strokeWidth="7" strokeLinecap="round" />
    <path d="M62 140c30 32 84 44 138 26 30-10 52-28 62-48" stroke={`url(#${id}-ring)`} strokeWidth="15" strokeLinecap="round" />
    <path d="M70 142c28 28 78 38 128 22" stroke="#EAFBFF" strokeOpacity=".5" strokeWidth="3.4" strokeLinecap="round" />

    <g className="cosmic-sparks" fill="#FFF3C8">
      <path d="m52 38 6 16 16 6-16 6-6 16-6-16-16-6 16-6 6-16Z" />
      <path d="m228 214 4 10 10 4-10 4-4 10-4-10-10-4 10-4 4-10Z" opacity=".8" />
      <path d="m34 214 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" opacity=".6" />
      <path d="m392 74 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" opacity=".5" />
    </g>
  </svg>;
}
