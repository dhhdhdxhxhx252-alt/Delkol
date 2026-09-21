import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Camera, Check, ChevronRight, CloudCheck, CloudOff, Copy, FileJson, FolderOpen, Image, Layers, LoaderCircle, LockKeyhole, LogOut, Mail, RefreshCcw, Save, ShieldCheck, Sparkles, Upload, UserRound } from 'lucide-react';
import { FRAME_CATALOG, RARITY_LABELS, PROFILE_COVERS, coverSource, frameDef, macroWord, type Profile } from '../data';
import { AVATAR_CATALOG } from '../avatars';
import { formatCount, type CommunityProfile } from '../lib/community';
import { readAvatar, readCover, copyText } from '../utils/profile';
import { Avatar } from './Avatar';
import { IconButton } from './UI';
import { AvatarFrameArt, PanelFrame } from './Ornaments';
import type { CloudAccount } from '../lib/supabase';

interface ProfilePageProps {
  profile: Profile;
  username: string;
  macroCount: number;
  groupCount: number;
  configCount: number;
  storageHealthy: boolean;
  onSave: (profile: Profile, username: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onMacros: () => void;
  onGroups: () => void;
  onConfigs: () => void;
  onNotify: (message: string, type?: 'success' | 'info' | 'warning') => void;
  account: CloudAccount | null;
  isGuest: boolean;
  cloudStatus: 'offline' | 'syncing' | 'online' | 'error';
  cloudPush: boolean;
  /** Human-readable reason of the last sync failure; shown under the status row. */
  cloudError: string | null;
  /** Manual re-sync requested from the profile card. */
  onRetryCloud: () => void;
  onSignOut: () => void;
  onChangePassword: (newPassword: string) => Promise<boolean>;
  communityProfile: CommunityProfile | null;
  onOpenShop: () => void;
}

export function ProfilePage({ profile, username, macroCount, groupCount, configCount, storageHealthy, onSave, onDirtyChange, onMacros, onGroups, onConfigs, onNotify, account, isGuest, cloudStatus, cloudPush, cloudError, onRetryCloud, onSignOut, onChangePassword, communityProfile, onOpenShop }: ProfilePageProps) {
  const [draft, setDraft] = useState(profile);
  const [handle, setHandle] = useState(username);
  const [coverPicker, setCoverPicker] = useState(false);
  const [uploading, setUploading] = useState<'avatar' | 'cover' | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [passwordDraft, setPasswordDraft] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordForm, setPasswordForm] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile) || handle !== username;
  const busy = uploading !== null;

  useEffect(() => { setDraft(profile); setHandle(username); setError(''); }, [profile, username]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange(false); requestRef.current += 1; }, [onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [dirty]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(timer);
  }, [copied]);

  const upload = async (kind: 'avatar' | 'cover', file?: File) => {
    if (!file) return;
    const request = ++requestRef.current;
    setUploading(kind); setError('');
    try {
      const data = kind === 'avatar' ? await readAvatar(file) : await readCover(file);
      if (request !== requestRef.current) return;
      setDraft((previous) => kind === 'avatar' ? { ...previous, avatar: data } : { ...previous, cover: 'custom', coverImage: data });
      if (kind === 'cover') setCoverPicker(true);
    } catch (cause) {
      if (request === requestRef.current) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить изображение.');
    } finally { if (request === requestRef.current) setUploading(null); }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!dirty || busy) return;
    if (!draft.displayName.trim()) { setError('Укажите отображаемое имя.'); return; }
    if (!/^[\p{L}\p{N}_.-]{2,24}$/u.test(handle)) { setError('Имя пользователя: от 2 до 24 букв, цифр, точек, дефисов или подчёркиваний.'); return; }
    setError('');
    onSave({ ...draft, displayName: draft.displayName.trim(), bio: draft.bio.trim() }, handle);
  };

  const discard = () => {
    requestRef.current += 1; setUploading(null); setDraft(profile); setHandle(username); setError(''); setCoverPicker(false); setGalleryOpen(false);
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (passwordBusy) return;
    if (passwordDraft.length < 6) { onNotify('Новый пароль должен быть не короче 6 символов.', 'warning'); return; }
    setPasswordBusy(true);
    const ok = await onChangePassword(passwordDraft);
    setPasswordBusy(false);
    if (ok) { setPasswordDraft(''); setPasswordForm(false); }
  };

  const cloudLabel = isGuest
    ? 'Гостевой режим'
    : cloudStatus === 'online' ? 'Синхронизировано'
    : cloudStatus === 'syncing' ? 'Синхронизация…'
    : cloudStatus === 'error' ? 'Ошибка синхронизации'
    : 'Локальный режим';
  const CloudGlyph = isGuest ? CloudOff : cloudStatus === 'error' ? CloudOff : CloudCheck;

  return <>
    <div className="page-heading profile-page-heading"><div><h1>Мой профиль<span className="heading-dot">.</span></h1><p>Маленькие детали, которые делают пространство вашим.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={discard} disabled={!dirty && !busy}>Отменить</button><button type="submit" form="profile-edit-form" className="button button-primary" disabled={!dirty || busy}><Save size={14} />Сохранить изменения</button></div></div>
    <div className="profile-cover"><AnimatePresence mode="wait"><motion.img key={draft.cover === 'custom' ? 'custom' : draft.cover} src={coverSource(draft)} alt={`Обложка профиля: ${draft.cover === 'custom' ? 'своё изображение' : PROFILE_COVERS[draft.cover].name}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .25 }} /></AnimatePresence><PanelFrame /></div>
    <form id="profile-edit-form" className="profile-body" onSubmit={submit} noValidate>
      <div className="profile-avatar-line">
        <div className={`profile-photo ${draft.frame !== 'none' ? 'is-framed' : ''}`}><Avatar profile={draft} size={82} framed /><button type="button" className="profile-avatar-edit" aria-label="Загрузить новый аватар" title="Загрузить аватар" disabled={busy} onClick={() => avatarInputRef.current?.click()}>{uploading === 'avatar' ? <LoaderCircle size={13} className="spin-icon" /> : <Camera size={13} />}</button></div>
        <button type="button" className="profile-cover-edit" aria-expanded={coverPicker} onClick={() => setCoverPicker(!coverPicker)}><Image size={14} />Изменить обложку</button>
      </div>
      <input ref={avatarInputRef} className="visually-hidden" tabIndex={-1} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Изображение аватара" onChange={(event) => { void upload('avatar', event.target.files?.[0]); event.target.value = ''; }} />
      <input ref={coverInputRef} className="visually-hidden" tabIndex={-1} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Изображение обложки" onChange={(event) => { void upload('cover', event.target.files?.[0]); event.target.value = ''; }} />
      <div className="profile-identity"><h2>{draft.displayName || 'Ваше имя'}</h2><div className="profile-identity-meta"><span>@{handle || 'username'}</span><i /><span>{profile.id}</span><IconButton icon={copied ? Check : Copy} label={copied ? 'ID скопирован' : 'Скопировать ID профиля'} onClick={() => { void copyText(profile.id).then(() => { setCopied(true); onNotify('ID профиля скопирован.'); }).catch(() => onNotify('Буфер обмена недоступен в этом браузере.', 'warning')); }} /></div><p>{draft.bio || 'У каждого свой игровой ритм.'}</p>
        {communityProfile && <div className="profile-stats-row">
          <span className="profile-stat"><strong>{formatCount(communityProfile.followers)}</strong><small>подписчиков</small></span>
          <i />
          <span className="profile-stat"><strong>{formatCount(communityProfile.profileViews)}</strong><small>просмотров</small></span>
          <i />
          <span className="profile-stat coins"><strong>{formatCount(communityProfile.coins)}</strong><small>монет</small></span>
        </div>}
        <span className="profile-account-status"><ShieldCheck size={12} />{account ? 'Аккаунт Delkol' : 'Личный аккаунт'}<span />{account ? cloudLabel : 'На этом устройстве'}</span></div>
      <AnimatePresence>{coverPicker && <motion.div className="profile-cover-picker" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .22 }}>
        <div role="radiogroup" aria-label="Обложка профиля">
          {Object.entries(PROFILE_COVERS).map(([key, cover]) => <button type="button" role="radio" aria-checked={draft.cover === key} aria-label={cover.name} className={draft.cover === key ? 'selected' : ''} key={key} onClick={() => setDraft((previous) => ({ ...previous, cover: key as Profile['cover'] }))}><img src={cover.image} alt="" /><span>{cover.name}{draft.cover === key && <Check size={12} />}</span></button>)}
          {draft.coverImage
            ? <button type="button" role="radio" aria-checked={draft.cover === 'custom'} aria-label="Своя обложка" className={draft.cover === 'custom' ? 'selected' : ''} onClick={() => setDraft((previous) => ({ ...previous, cover: 'custom' }))}><img src={draft.coverImage} alt="" /><span>Своя{draft.cover === 'custom' && <Check size={12} />}</span></button>
            : <button type="button" className="cover-upload-tile" disabled={busy} onClick={() => coverInputRef.current?.click()}><span className="cover-upload-symbol">{uploading === 'cover' ? <LoaderCircle size={17} className="spin-icon" /> : <Upload size={17} strokeWidth={1.5} />}</span><span>Своя обложка<small>JPG, PNG, WebP</small></span></button>}
        </div>
        <div className="cover-picker-actions">
          <button type="button" className="profile-text-action" disabled={busy} onClick={() => coverInputRef.current?.click()}>{uploading === 'cover' ? 'Загружаем...' : draft.coverImage ? 'Заменить своё изображение' : 'Загрузить с компьютера'}<ArrowUpRight size={12} /></button>
          {draft.coverImage && <button type="button" className="profile-remove-avatar" disabled={busy} onClick={() => setDraft((previous) => ({ ...previous, cover: previous.cover === 'custom' ? 'pearl' : previous.cover, coverImage: '' }))}>Удалить своё</button>}
        </div>
      </motion.div>}</AnimatePresence>
      {error && <p className="form-error profile-error" role="alert">{error}</p>}
      <section className="profile-detail-section">
        <h3><UserRound size={15} />Основная информация</h3>
        <div className="profile-field"><label htmlFor="profile-display-name">Отображаемое имя</label><input id="profile-display-name" value={draft.displayName} required maxLength={40} placeholder="Ваше имя" onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></div>
        <div className="profile-field"><label htmlFor="profile-username">Имя пользователя</label><div className="profile-handle-input"><span>@</span><input id="profile-username" value={handle} required maxLength={24} minLength={2} placeholder="username" onChange={(event) => setHandle(event.target.value.replace(/\s/g, ''))} /></div></div>
        <div className="profile-field profile-bio-field"><label htmlFor="profile-bio">О себе<span>{draft.bio.length} / 180</span></label><textarea id="profile-bio" rows={2} maxLength={180} value={draft.bio} placeholder="Пара слов о вашем игровом ритме" onChange={(event) => setDraft({ ...draft, bio: event.target.value })} /></div>
        <div className="profile-field profile-photo-field"><span>Фото профиля</span><div>
          <button type="button" className="profile-text-action" onClick={() => setGalleryOpen(!galleryOpen)} aria-expanded={galleryOpen}>{galleryOpen ? 'Скрыть галерею' : 'Выбрать из галереи'}<ArrowUpRight size={12} className={galleryOpen ? 'rotated' : ''} /></button>
          <button type="button" className="profile-text-action" disabled={busy} onClick={() => avatarInputRef.current?.click()}>Загрузить фото<ArrowUpRight size={12} /></button>
          {draft.avatar && <button type="button" className="profile-remove-avatar" disabled={busy} onClick={() => setDraft({ ...draft, avatar: '' })}>Удалить</button>}
        </div></div>
        {galleryOpen && <div className="profile-avatar-gallery" role="listbox" aria-label="Галерея аватаров">
          {AVATAR_CATALOG.map((src) => <button type="button" role="option" aria-selected={draft.avatar === src} key={src} className={`profile-avatar-option ${draft.avatar === src ? 'selected' : ''}`} onClick={() => setDraft({ ...draft, avatar: src })}>
            <img src={src} alt="" loading="lazy" draggable={false} />
            {draft.avatar === src && <i><Check size={10} /></i>}
          </button>)}
        </div>}
        <div className="profile-field profile-frame-field">
          <span>Рамка аватара</span>
          <div className="profile-frame-gallery">
            {FRAME_CATALOG.filter((frame) => !communityProfile?.ownedFrames?.length || communityProfile.ownedFrames.includes(frame.id) || frame.price === 0).map((frame) =>
              <button type="button" key={frame.id} className={`profile-frame-option ${draft.frame === frame.id ? 'selected' : ''}`} title={`${frame.name} · ${RARITY_LABELS[frame.rarity]}`} onClick={() => setDraft({ ...draft, frame: frame.id })}>
                <span className={`profile-frame-thumb frame-${frame.id}`}>{frame.id === 'none' ? <span className="profile-frame-none">—</span> : <AvatarFrameArt frame={frame.id} />}</span>
                <small>{frame.name}</small>
              </button>)}
            <button type="button" className="profile-frame-option profile-frame-more" onClick={onOpenShop}>
              <span className="profile-frame-thumb"><Sparkles size={15} /></span>
              <small>Магазин рамок</small>
            </button>
          </div>
          <p className="profile-frame-hint">Надета: {frameDef(draft.frame).name}. Новые рамки — в магазине.</p>
        </div>
      </section>
      <section className="profile-detail-section"><h3><Layers size={15} />Ваше игровое пространство</h3><button type="button" className="profile-info-row" onClick={onMacros}><span><Layers size={14} />Мои макросы</span><span>{macroCount} {macroWord(macroCount)}<ChevronRight size={13} /></span></button><button type="button" className="profile-info-row" onClick={onGroups}><span><FolderOpen size={14} />Группы макросов</span><span>{groupCount}<ChevronRight size={13} /></span></button><button type="button" className="profile-info-row" onClick={onConfigs}><span><FileJson size={14} />Сохранённые конфиги</span><span>{configCount}<ChevronRight size={13} /></span></button></section>

      {account && <section className="profile-detail-section profile-account-section">
        <h3><Mail size={15} />Аккаунт и облако</h3>
        <div className="profile-info-row"><span><Mail size={14} />Эл. почта</span><span className="profile-account-email">{account.email}</span></div>
        <div className="profile-info-row"><span>{cloudPush ? <RefreshCcw size={14} className="spin-icon" /> : <CloudGlyph size={14} />}Состояние облака</span><span className={cloudStatus === 'error' ? 'danger-text' : 'profile-private-status'}>{cloudPush ? <><RefreshCcw size={12} className="spin-icon" />Сохраняем…</> : cloudLabel}</span></div>
        {cloudStatus === 'error' && <div className="profile-cloud-error">
          <span className="profile-cloud-error-text">{cloudError ?? 'Не удалось связаться с сервером. Проверьте интернет.'}</span>
          <button type="button" className="profile-cloud-retry" onClick={onRetryCloud} disabled={cloudPush}><RefreshCcw size={12} />Повторить</button>
        </div>}
        <div className="profile-info-row"><span>Аккаунт создан</span><span>{account.createdAt ? new Date(account.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</span></div>
        {passwordForm
          ? <form className="profile-password-form" onSubmit={submitPassword}>
              <input type="password" autoComplete="new-password" placeholder="Новый пароль (мин. 6 символов)" value={passwordDraft} maxLength={72} onChange={(event) => setPasswordDraft(event.target.value)} />
              <button type="submit" className="button button-primary" disabled={passwordBusy || passwordDraft.length < 6}>{passwordBusy ? <LoaderCircle size={13} className="spin-icon" /> : <LockKeyhole size={13} />}Сменить</button>
              <button type="button" className="button button-secondary" onClick={() => { setPasswordForm(false); setPasswordDraft(''); }}>Отмена</button>
            </form>
          : <div className="profile-info-row profile-account-actions">
              <span><LockKeyhole size={14} />Пароль</span>
              <span className="profile-account-buttons">
                <button type="button" className="button button-secondary" onClick={() => setPasswordForm(true)}>Сменить пароль</button>
                <button type="button" className="button button-danger-ghost" onClick={onSignOut}><LogOut size={13} />Выйти из аккаунта</button>
              </span>
            </div>}
        <p>Профиль, макросы, группы и настройки синхронизируются с облаком автоматически. Конфиги хранятся только на этом устройстве.</p>
      </section>}

      {isGuest && <section className="profile-detail-section profile-account-section">
        <h3><CloudOff size={15} />Гостевой режим</h3>
        <p>Данные сохраняются только на этом устройстве. Выйдите из приложения и войдите в аккаунт, чтобы включить облачную синхронизацию.</p>
      </section>}

      <section className="profile-detail-section profile-privacy"><h3><LockKeyhole size={15} />Приватность и хранение</h3><div className="profile-info-row"><span>Данные профиля</span><span className={storageHealthy ? 'profile-private-status' : 'danger-text'}><ShieldCheck size={12} />{account ? 'Облако + это устройство' : storageHealthy ? 'Хранятся локально' : 'Сохранение недоступно'}</span></div><div className="profile-info-row"><span>Профиль создан</span><span>{new Date(profile.joinedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div><p>Профиль виден только вам. Аватар и обложка хранятся надёжно и не попадают в экспортированные конфигурации.</p></section>
      {dirty && <div className="profile-unsaved-note"><span />Есть несохранённые изменения<button type="submit" disabled={busy}>Сохранить<ChevronRight size={13} /></button></div>}
    </form>
  </>;
}
