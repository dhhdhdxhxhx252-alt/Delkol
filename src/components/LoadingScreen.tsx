import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Star } from 'lucide-react';
import { assetUrl } from '../paths';
import { BRAND_NAME } from '../brand';
import { BrandMark } from './UI';

const STAGES = [
  'Пробуждаем пространство…',
  'Проверяем сессию…',
  'Синхронизируем данные…',
  'Загружаем конфигурации…',
  'Настраиваем профиль…',
  'Проверяем обновления…',
  'Почти готово…',
];

/**
 * Loading window — first screen on startup.
 * Design: bunny art on black card, whale chip top-left, "Loading …" bottom-left,
 * "About us" bottom-right, thin progress bar underneath.
 * Short branded pause (~2.5s): long enough to feel polished, short enough that
 * startup stays instant. The splash paints immediately — no network is touched.
 */
export function LoadingScreen({ minimumMs = 2_500, onDone }: { minimumMs?: number; onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const share = Math.min(1, (Date.now() - started) / minimumMs);
      setProgress(share);
      setStage(Math.min(STAGES.length - 1, Math.floor(share * STAGES.length)));
      if (share >= 1) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [minimumMs]);

  const finish = useCallback(() => {
    setProgress(1);
    window.setTimeout(onDone, 260);
  }, [onDone]);

  useEffect(() => {
    if (progress < 1) return;
    finish();
  }, [progress, finish]);

  return (
    <div className="loading-screen" role="status" aria-label={`Загрузка ${BRAND_NAME}`}>
      <div className="loading-card">
        <img className="loading-art" src={assetUrl('/images/loading-bunny.jpg')} alt="" draggable={false} />
        <div className="loading-vignette" aria-hidden="true" />

        <header className="loading-brand">
          <span className="loading-brand-mark" aria-hidden="true"><BrandMark small /></span>
          <span className="loading-brand-name">{BRAND_NAME}</span>
        </header>

        <footer className="loading-footer">
          <span className="loading-status">
            <Star size={11} fill="currentColor" aria-hidden="true" />
            {`Loading ${'.'.repeat(1 + Math.floor(progress * 3))}`}
          </span>
          <motion.span key={stage} className="loading-stage" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}>
            {STAGES[stage]}
          </motion.span>
          <span className="loading-about">
            About us <i aria-hidden="true" /> Revolut United Kingdom <Star size={11} fill="currentColor" aria-hidden="true" />
          </span>
        </footer>

        <div className="loading-progress" aria-hidden="true">
          <motion.span initial={{ width: '4%' }} animate={{ width: `${Math.max(4, Math.round(progress * 100))}%` }} transition={{ ease: 'easeOut', duration: 0.24 }} />
        </div>
      </div>
    </div>
  );
}
