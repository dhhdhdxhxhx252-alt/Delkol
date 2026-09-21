import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, MessageCircle, ShoppingBag, X } from 'lucide-react';
import { coverSource, frameDef, type Profile } from '../data';
import { formatCount, type CommunityProfile } from '../lib/community';
import { Avatar } from './Avatar';
import { IconButton } from './UI';
import { PanelFrame } from './Ornaments';

export interface ProfilePopupProps {
  profile: Profile;
  handle: string;
  communityProfile: CommunityProfile | null;
  /** Viewport point of the clicked avatar — the card anchors next to it. */
  anchor: { x: number; y: number };
  onClose: () => void;
  onOpen: () => void;
  onOpenShop: () => void;
}

const CARD_W = 216;
const CARD_H = 272;

/** Place the card like a context menu: beside the avatar, clamped to the viewport. */
function anchoredStyle(anchor: { x: number; y: number }): { left: number; top: number } {
  const margin = 8;
  const left = anchor.x + 10 + CARD_W + margin <= window.innerWidth
    ? anchor.x + 10
    : Math.max(margin, anchor.x - CARD_W - 10);
  const top = Math.min(Math.max(margin, anchor.y - 16), Math.max(margin, window.innerHeight - CARD_H - margin));
  return { left, top };
}

/**
 * Compact Discord-style mini profile card: opens beside the sidebar avatar
 * instead of jumping straight to the full profile page.
 */
export function ProfilePopup({ profile, handle, communityProfile, anchor, onClose, onOpen, onOpenShop }: ProfilePopupProps) {
  const followers = communityProfile?.followers ?? 0;
  const views = communityProfile?.profileViews ?? 0;
  const coins = communityProfile?.coins ?? 0;
  const frame = communityProfile?.frame ?? profile.frame;
  const style = anchoredStyle(anchor);

  return <motion.div className="profile-pop-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .16 }}
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    onContextMenu={(event) => { event.preventDefault(); onClose(); }}>
    <motion.div role="dialog" aria-modal="true" aria-label={`Профиль ${profile.displayName}`} className="profile-pop" style={{ ...style, transformOrigin: 'left center' }}
      initial={{ opacity: 0, x: -6, y: 4, scale: .94 }} animate={{ opacity: 1, x: 0, y: 0, scale: 1 }} exit={{ opacity: 0, x: -4, y: 3, scale: .96 }}
      transition={{ duration: .18, ease: [.2, .7, .3, 1] }}>
      <div className="profile-pop-cover">
        <img src={coverSource(profile)} alt="" draggable={false} />
        <span className="profile-pop-shade" />
        <PanelFrame />
        <span className="profile-pop-close"><IconButton icon={X} label="Закрыть карточку профиля" onClick={onClose} /></span>
      </div>
      <div className="profile-pop-head">
        <span className="profile-pop-avatar"><Avatar profile={{ ...profile, frame: frame as Profile['frame'] }} size={56} framed online /></span>
      </div>
      <div className="profile-pop-body">
        <div className="profile-pop-name">
          <h3>{profile.displayName}</h3>
          {frame !== 'none' && <em className="profile-pop-frame">{frameDef(frame).name}</em>}
        </div>
        <span className="profile-pop-handle">@{handle}</span>
        {profile.bio && <p className="profile-pop-bio">{profile.bio}</p>}
        <div className="profile-pop-stats">
          <span><strong>{formatCount(followers)}</strong><small>подписчиков</small></span>
          <i />
          <span><strong>{formatCount(views)}</strong><small>просмотров</small></span>
          <i />
          <span className="coins"><strong>{formatCount(coins)}</strong><small>монет</small></span>
        </div>
        <div className="profile-pop-actions">
          <button className="profile-pop-action" onClick={onOpen}><MessageCircle size={12} strokeWidth={1.8} /><span>Профиль</span><ChevronRight size={11} /></button>
          <button className="profile-pop-action secondary" onClick={onOpenShop}><ShoppingBag size={12} strokeWidth={1.5} /><span>Магазин</span><ChevronRight size={11} /></button>
        </div>
      </div>
    </motion.div>
  </motion.div>;
}

export function ProfilePopupHost({ open, children }: { open: boolean; children: ReactNode }) {
  return <AnimatePresence>{open && children}</AnimatePresence>;
}
