import { useEffect, useState } from 'react';
import { Check, Coins, Crown, Download, Eye, Heart, LoaderCircle, LogIn, ShoppingBag, ThumbsDown, ThumbsUp, Users } from 'lucide-react';
import { FRAME_CATALOG, RARITY_LABELS, frameDef, type FrameDef } from '../data';
import { formatCount, fetchMyReactions, fetchTopConfigs, purchaseFrame, reactToConfig, recordConfigDownload, setMyFrame, type CommunityConfig, type CommunityProfile } from '../lib/community';
import { catalogAvatar, isCatalogAvatar } from '../avatars';
import type { CloudAccount } from '../lib/supabase';
import { AvatarFrameArt } from './Ornaments';
import { EmptyState } from './UI';

/** A tiny avatar for community profiles (catalog art, remote DiceBear art or data-URL). */
function UserPic({ profile, size }: { profile: CommunityProfile; size: number }) {
  const framed = profile.frame !== 'none';
  const source = !profile.avatar || isCatalogAvatar(profile.avatar) ? catalogAvatar(profile.handle) : profile.avatar;
  return <span className={`user-avatar ${framed ? 'has-frame' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
    {source
      ? <img src={source} alt="" loading="lazy" draggable={false} />
      : <span className="avatar-initials">{profile.displayName.slice(0, 2).toLowerCase()}</span>}
    {framed && <AvatarFrameArt frame={profile.frame} />}
  </span>;
}

/** Аватарка с рамкой из магазина для строки «Топ конфиги» (крупнее, с hover). */
function TopUserPic({ profile }: { profile: CommunityProfile | null }) {
  if (!profile) return null;
  return <span className="top-author-avatar"><UserPic profile={profile} size={38} /></span>;
}

function Stat({ icon: Icon, value }: { icon: typeof Eye; value: string }) {
  return <span className="community-stat"><Icon size={11} />{value}</span>;
}

// ------------------------------------------------------------------
// Топ конфиги
// ------------------------------------------------------------------
export function TopConfigs({ isSignedIn, onApply, onNotify }: { isSignedIn: boolean; onApply: (row: CommunityConfig) => void; onNotify: (text: string, type?: 'success' | 'info' | 'warning') => void }) {
  const [rows, setRows] = useState<CommunityConfig[] | null>(null);
  const [reactions, setReactions] = useState<Record<string, 'like' | 'dislike'>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const configs = await fetchTopConfigs(120);
        if (!alive) return;
        setRows(configs);
        setReactions(await fetchMyReactions(configs.map((row) => row.id)));
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить топ конфигов.');
      }
    })();
    return () => { alive = false; };
  }, []);

  const react = async (row: CommunityConfig, value: 'like' | 'dislike') => {
    if (!isSignedIn) { onNotify('Войдите в аккаунт, чтобы ставить оценки.', 'warning'); return; }
    if (busy) return;
    setBusy(row.id + value);
    try {
      const next = await reactToConfig(row.id, value);
      setRows((previous) => previous!.map((item) => item.id === row.id
        ? { ...item, reaction: next ?? null, likes: item.likes + (value === 'like' ? (next === 'like' ? 1 : item.reaction === 'like' ? -1 : 0) : item.reaction === 'like' ? -1 : 0), dislikes: item.dislikes + (value === 'dislike' ? (next === 'dislike' ? 1 : item.reaction === 'dislike' ? -1 : 0) : item.reaction === 'dislike' ? -1 : 0) }
        : item));
      setReactions((previous) => {
        const copy = { ...previous };
        if (next) copy[row.id] = next; else delete copy[row.id];
        return copy;
      });
    } catch (cause) {
      onNotify(cause instanceof Error ? cause.message : 'Не удалось сохранить оценку.', 'warning');
    } finally { setBusy(null); }
  };

  const download = async (row: CommunityConfig) => {
    onApply(row);
    void recordConfigDownload(row.id).then(() => {
      setRows((previous) => previous!.map((item) => item.id === row.id ? { ...item, downloads: item.downloads + 1, views: item.views + 1 } : item));
    }).catch(() => undefined);
  };

  if (error) return <EmptyState icon={Crown} title="Топ недоступен" description={error} />;
  if (!rows) return <div className="community-loading"><LoaderCircle size={22} className="spin-icon" /><span>Загружаем топ сообщества…</span></div>;

  return <div className="community-top-list">
    {rows.map((row, index) => {
      const rank = index + 1;
      const medal = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
      const mine = reactions[row.id] ?? row.reaction ?? null;
      return <article className={`community-config-row ${rank <= 3 ? `is-top${medal ? ` medal-${medal}` : ''}` : ''}`} key={row.id}>
        <span className={`community-rank ${medal ? `rank-${medal}` : ''}`}>{rank}</span>
        <TopUserPic profile={row.author} />
        <div className="community-config-copy">
          <strong title={row.name}>{row.name}</strong>
          <span className="community-config-author">
            @{row.author?.handle ?? '—'}
            {row.author && row.author.frame !== 'none' && <em className="community-frame-chip">{frameDef(row.author.frame).name}</em>}
          </span>
          {row.description && <p>{row.description}</p>}
          <div className="community-config-stats">
            <Stat icon={ThumbsUp} value={formatCount(row.likes)} />
            <Stat icon={ThumbsDown} value={formatCount(row.dislikes)} />
            <Stat icon={Download} value={formatCount(row.downloads)} />
            <Stat icon={Eye} value={formatCount(row.views)} />
            <Stat icon={Users} value={formatCount(row.author?.followers ?? 0)} />
          </div>
        </div>
        <div className="community-config-actions">
          <button className={`community-react like ${mine === 'like' ? 'active' : ''}`} aria-label="Нравится" disabled={busy === row.id + 'like'} onClick={() => react(row, 'like')}><Heart size={13} />{formatCount(row.likes)}</button>
          <button className={`community-react dislike ${mine === 'dislike' ? 'active' : ''}`} aria-label="Не нравится" disabled={busy === row.id + 'dislike'} onClick={() => react(row, 'dislike')}><ThumbsDown size={13} /></button>
          <button className="button button-primary community-download" onClick={() => download(row)}><Download size={13} />Применить</button>
        </div>
      </article>;
    })}
    {!rows.length && <EmptyState icon={Crown} title="Пока пусто" description="Конфиги сообщества появятся здесь." />}
  </div>;
}

// ------------------------------------------------------------------
// Магазин: рамки + аватарки
// ------------------------------------------------------------------
export function FrameShop({ account, profile, onNotify, onPurchased }: {
  account: CloudAccount | null;
  profile: CommunityProfile | null;
  onNotify: (text: string, type?: 'success' | 'info' | 'warning') => void;
  onPurchased: (coins: number, owned: string[], equipped: string) => void;
}) {
  const frames: FrameDef[] = FRAME_CATALOG;
  const [busy, setBusy] = useState<string | null>(null);
  const [section] = useState<'frames' | 'avatars'>('frames');

  const owned = profile?.ownedFrames ?? ['none', 'sakura'];
  const coins = profile?.coins ?? 0;
  const equipped = profile?.frame ?? 'sakura';

  const buy = async (frame: FrameDef) => {
    if (!account) { onNotify('Войдите в аккаунт, чтобы покупать рамки.', 'warning'); return; }
    if (busy) return;
    setBusy(frame.id);
    try {
      if (owned.includes(frame.id)) {
        await setMyFrame(account, frame.id);
        onPurchased(coins, owned, frame.id);
        onNotify(`Рамка «${frame.name}» надета.`);
      } else {
        const result = await purchaseFrame(account, frame.id);
        onPurchased(result.coins, result.owned, result.equipped);
        onNotify(`Рамка «${frame.name}» куплена и надета! Осталось ${result.coins} монет.`);
      }
    } catch (cause) {
      onNotify(cause instanceof Error ? cause.message : 'Покупка не удалась.', 'warning');
    } finally { setBusy(null); }
  };

  return <div className="shop-wrap">
    <div className="shop-topline">
      <div className="shop-section-switch" role="tablist" aria-label="Разделы магазина">
        <button role="tab" aria-selected className="active">Рамки</button>
      </div>
      <div className="shop-balance"><Coins size={15} /><span>{formatCount(coins)}</span><small>монет</small></div>
    </div>

    {section === 'frames' && <>
      <div className="shop-grid">
        {frames.map((frame) => {
          const isOwned = owned.includes(frame.id);
          const isEquipped = equipped === frame.id;
          const afford = coins >= frame.price;
          return <div className={`shop-card shop-frame-card rarity-${frame.rarity} ${isEquipped ? 'equipped' : ''}`} key={frame.id}>
            <span className="shop-frame-preview" aria-hidden="true">
              {frame.id !== 'none'
                ? <AvatarFrameArt frame={frame.id} className="shop-frame-art" />
                : <span className="shop-preview-none">—</span>}
            </span>
            <strong>{frame.name}</strong>
            <em>{RARITY_LABELS[frame.rarity as FrameDef['rarity']]}</em>
            <div className="shop-card-footer">
              {isEquipped
                ? <span className="shop-state equipped-state"><Check size={12} />Надета</span>
                : isOwned
                  ? <button className="button button-secondary shop-buy" disabled={busy === frame.id} onClick={() => buy(frame)}>{busy === frame.id ? <LoaderCircle size={12} className="spin-icon" /> : null}Надеть</button>
                  : <button className={`button ${afford ? 'button-primary' : 'button-secondary'} shop-buy`} disabled={!account || busy === frame.id || !afford} title={!account ? 'Нужен аккаунт' : !afford ? 'Не хватает монет' : ''} onClick={() => buy(frame)}>
                      {busy === frame.id ? <LoaderCircle size={12} className="spin-icon" /> : <ShoppingBag size={12} />}{frame.price}
                    </button>}
            </div>
          </div>;
        })}
      </div>
      {!account && <div className="shop-guest-note"><LogIn size={13} />Войдите в аккаунт — за активность начисляются монеты, а рамки сохраняются в облаке.</div>}
    </>}
  </div>;
}
