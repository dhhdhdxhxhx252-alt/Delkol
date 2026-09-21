import type { Profile } from '../data';
import { AvatarFrameArt } from './Ornaments';

export function Avatar({ profile, size = 30, online = false, className = '', framed = false }: { profile: Pick<Profile, 'avatar' | 'displayName' | 'frame'>; size?: number; online?: boolean; className?: string; framed?: boolean }) {
  const showFrame = framed && profile.frame !== 'none';
  return <span className={`user-avatar ${showFrame ? 'has-frame' : ''} ${className}`} style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * .33)) }} aria-hidden="true">
    {profile.avatar && !profile.avatar.startsWith('http') ? <img src={profile.avatar} alt="" draggable={false} /> : profile.avatar ? <img src={profile.avatar} alt="" draggable={false} loading="lazy" /> : <span className="avatar-initials">{profile.displayName.slice(0, 2).toLowerCase()}</span>}
    {showFrame && <AvatarFrameArt frame={profile.frame} />}
    {online && <i className="avatar-online" />}
  </span>;
}
