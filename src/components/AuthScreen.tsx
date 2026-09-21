import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Eye, EyeOff, LoaderCircle, Lock, Mail, Minus, Star, X } from 'lucide-react';
import { assetUrl } from '../paths';
import { BRAND_NAME } from '../brand';
import { BrandMark } from './UI';
import { AuthError, getSessionAccount, sendPasswordReset, signIn, signUp, type CloudAccount } from '../lib/supabase';

type Mode = 'login' | 'register';

type DelkolBridge = {
  isElectron?: boolean;
  windowName?: string;
  minimize?: () => void;
  toggleMaximize?: () => void;
  close?: () => void;
  /** Renderer tells the main process the login form is actually needed. */
  authShow?: () => void;
};
const bridge = (window as unknown as { delkol?: DelkolBridge }).delkol;
// `?window=auth` marks the dedicated login window (Electron). There the card
// fills the whole window — no cosmos backdrop behind it.

interface AuthScreenProps {
  onAuthenticated: (account: CloudAccount) => void;
  onGuest: () => void;
}

/**
 * Login / Registration window — second screen.
 * Design: full-bleed cosmos background (screen 1), white whale logo (screen 3),
 * dark card, "Welcome!" headline, starred tagline, pill inputs, purple button.
 */
export function AuthScreen({ onAuthenticated, onGuest }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  // Saved session → skip the login form entirely. In Electron the auth window
  // stays hidden (auth:show) until this check finishes, so the login never
  // flashes. Web build simply jumps to the workspace.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const account = await getSessionAccount();
        if (!alive) return;
        if (account) onAuthenticated(account);
      } catch {
        // Offline / no session: fall through to the login form.
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (checking || !bridge?.authShow) return;
    bridge.authShow();
  }, [checking]);

  useEffect(() => {
    if (checking) return;
    cardRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [mode, checking]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setError('Введите корректный e-mail.'); return; }
    if (password.length < 6) { setError('Пароль должен быть не короче 6 символов.'); return; }
    if (mode === 'register' && password !== confirm) { setError('Пароли не совпадают.'); return; }

    setBusy(true);
    try {
      if (mode === 'login') {
        const account = await signIn(trimmedEmail, password);
        onAuthenticated(account);
      } else {
        const { account, needsConfirm } = await signUp(trimmedEmail, password);
        if (needsConfirm) {
          setNotice('Мы отправили письмо для подтверждения на ' + trimmedEmail + '. Подтвердите e-mail и войдите.');
          setMode('login');
          setPassword('');
          setConfirm('');
        } else if (account) {
          onAuthenticated(account);
        }
      }
    } catch (cause) {
      setError(cause instanceof AuthError ? cause.message : 'Что-то пошло не так. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setError('');
    setNotice('');
    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setError('Введите e-mail в поле выше, и мы пришлём ссылку для сброса.'); return; }
    setBusy(true);
    try {
      await sendPasswordReset(trimmedEmail);
      setNotice('Ссылка для восстановления отправлена на ' + trimmedEmail + '.');
    } catch (cause) {
      setError(cause instanceof AuthError ? cause.message : 'Не удалось отправить письмо.');
    } finally {
      setBusy(false);
    }
  };

  const isElectron = !!bridge?.isElectron || bridge?.windowName === 'auth' || new URLSearchParams(window.location.search).get('window') === 'auth';

  return (
    <div className={`auth-screen ${isElectron ? 'is-electron' : ''}`}>
      {/* In Electron the window IS the card — no backdrop. Web keeps the cosmos scene. */}
      {!isElectron && <img className="auth-bg" src={assetUrl('/images/auth-cosmos.jpg')} alt="" draggable={false} />}
      {!isElectron && <div className="auth-bg-shade" aria-hidden="true" />}

      {isElectron && (
        <div className="auth-window-bar" aria-hidden="false">
          <span />
          <div className="window-controls">
            <button type="button" className="window-control window-minimize" aria-label="Свернуть" title="Свернуть" onClick={() => bridge?.minimize?.()}><Minus size={14} strokeWidth={1.6} /></button>
            <button type="button" className="window-control window-close" aria-label="Закрыть" title="Закрыть" onClick={() => bridge?.close?.()}><X size={15} strokeWidth={1.6} /></button>
          </div>
        </div>
      )}

      <motion.div
        ref={cardRef}
        className="auth-card"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.2, 0.7, 0.3, 1] }}
      >
        <div className="auth-hero" aria-hidden="true">
          <img src={assetUrl('/images/auth-cosmos.jpg')} alt="" draggable={false} />
        </div>
        <span className="auth-whale" aria-hidden="true"><BrandMark /></span>
        <h1 className="auth-title">{mode === 'login' ? 'Welcome!' : 'Создать аккаунт'}</h1>
        <p className="auth-tagline">
          <Star size={10} fill="currentColor" aria-hidden="true" />
          {mode === 'login'
            ? 'Войдите, чтобы синхронизировать макросы и настройки'
            : 'Регистрация занимает меньше минуты'}
          <Star size={10} fill="currentColor" aria-hidden="true" />
        </p>

        <form className="auth-form" onSubmit={submit} noValidate>
          {mode === 'register' && (
            <label className="auth-field">
              <span className="auth-field-icon"><Mail size={15} /></span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="Эл. почта"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
              />
            </label>
          )}
          <label className="auth-field">
            <span className="auth-field-icon"><Mail size={15} /></span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Эл. почта"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
            />
          </label>
          <label className="auth-field">
            <span className="auth-field-icon"><Lock size={15} /></span>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="Пароль"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              className="auth-eye"
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              onClick={() => setShowPassword((previous) => !previous)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </label>
          {mode === 'register' && (
            <label className="auth-field">
              <span className="auth-field-icon"><Lock size={15} /></span>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Повторите пароль"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                disabled={busy}
              />
            </label>
          )}

          {error && <p className="auth-message error" role="alert">{error}</p>}
          {notice && <p className="auth-message ok" role="status">{notice}</p>}

          {mode === 'login' && (
            <button type="button" className="auth-link" onClick={forgot} disabled={busy}>Forgot your key?</button>
          )}

          <div className="auth-or-row" aria-hidden="true"><span />или<div /></div>

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="auth-spinner" /> : null}
            {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </button>

          <button type="button" className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNotice(''); }} disabled={busy}>
            {mode === 'login' ? 'Нет аккаунта? Создать' : 'Уже есть аккаунт? Войти'}
          </button>
        </form>

        <footer className="auth-card-footer">
          <button type="button" className="auth-foot-link" onClick={onGuest}>Пропустить вход</button>
          <span className="auth-foot-brand">{BRAND_NAME}</span>
        </footer>
      </motion.div>
    </div>
  );
}
