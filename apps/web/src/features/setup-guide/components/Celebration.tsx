import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { OPALSWIFT_BRAND } from '@/lib/theme/opalswiftBrand';
import type { CelebrationMoment } from '../lib/setupFun';

/** Whether the visitor asked for less motion (checked once; no motion when unknown). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

/**
 * The level gem, in OpalSwift colours: one facet lights up per level (1–4).
 * Decorative: the level is always written next to it.
 */
export function GemBadge({ level, size = 40 }: { level: number; size?: number }) {
  const lit = (n: number) => (level >= n ? OPALSWIFT_BRAND.primary : '#E4E7F5');
  const lit2 = (n: number) => (level >= n ? OPALSWIFT_BRAND.accent : '#EEF0F8');
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 40 40" className="shrink-0">
      {/* Crown (two facets) and pavilion (two facets). */}
      <polygon points="8,14 14,6 20,14" fill={lit2(1)} />
      <polygon points="20,14 26,6 32,14" fill={lit2(2)} />
      <polygon points="8,14 20,14 20,36" fill={lit(3)} />
      <polygon points="20,14 32,14 20,36" fill={lit(4)} />
      <polygon points="14,6 26,6 20,14" fill="#FFFFFF" opacity="0.7" />
      <polygon points="8,14 14,6 26,6 32,14 20,36" fill="none" stroke={OPALSWIFT_BRAND.primary} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

const CONFETTI_COLOURS = [OPALSWIFT_BRAND.primary, OPALSWIFT_BRAND.accent, '#FFB547', '#FF7AA2'];

/**
 * A single fall of confetti, about 3 seconds, then gone. Pieces only fall and turn
 * slowly (nothing flashes). Reduced motion: a still gem instead. Decorative only.
 */
export function Confetti() {
  const [reduced] = useState(prefersReducedMotion);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => setGone(true), 3500);
    return () => window.clearTimeout(timer);
  }, [reduced]);
  if (reduced) {
    return (
      <span aria-hidden="true" className="inline-flex" data-testid="celebration-still">
        <GemBadge level={4} size={48} />
      </span>
    );
  }
  if (gone) return null;
  return (
    <div aria-hidden="true" data-testid="celebration-confetti" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0 overflow-visible">
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          className="setup-confetti-piece"
          style={{
            insetInlineStart: `${(i * 97) % 100}%`,
            backgroundColor: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
            animationDelay: `${(i % 9) * 0.12}s`,
            animationDuration: `${2.2 + (i % 5) * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The celebration message. Announced politely, never takes focus, never closes by
 * itself; closes with its button or Esc.
 */
export function CelebrationBanner({
  moment,
  fewer,
  onDismiss,
}: {
  moment: CelebrationMoment;
  fewer: boolean;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="card flex flex-wrap items-start gap-4 border border-primary/40 bg-primary/5"
      data-testid="celebration"
    >
      {!fewer && <Confetti />}
      <div className="min-w-0 flex-1 basis-56 space-y-1" role="status" aria-live="polite">
        <h2 id={`${id}-title`} className="text-xl font-bold text-primary">
          {t(`setup_guide.celebrate.${moment}.title`)}
        </h2>
        <p className="text-sm">{t(`setup_guide.celebrate.${moment}.body`)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {moment === 'setup_done' && (
          <Link
            to="/admin/leads/get"
            className="inline-flex items-center rounded-[var(--radius-button)] bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover outline-offset-2 focus-visible:outline-2"
          >
            {t('setup_guide.celebrate.share_link')}
          </Link>
        )}
        <Button variant="outline" size="sm" onClick={onDismiss}>
          {t('setup_guide.celebrate.dismiss')}
        </Button>
      </div>
    </section>
  );
}
