import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { isOnPath, tourFor } from './tours';
import type { ActiveTour } from './AssistantContext';

const RING_GAP = 6;
const POLL_MS = 300;

/**
 * "Show me how": walks one guide's steps in order. Each step opens its page and
 * puts a ring round the thing to press; the admin presses it themself (the ring
 * lets clicks through). A step whose element isn't showing (yet) shows its text
 * on its own, and the ring appears as soon as the element does.
 */
export function TourOverlay({ tour, onChange }: { tour: ActiveTour; onChange: (next: ActiveTour | null) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const raw = t(`help.topics.${tour.guideId}.steps`, { returnObjects: true }) as unknown;
  const texts = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  const steps = tourFor(tour.guideId, texts.length);
  const step = steps?.[tour.index];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const scrolledFor = useRef<string | null>(null);

  // Open the step's page (once per step; the admin can still move about).
  const stepPath = step?.path;
  const navigatedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${tour.guideId}:${tour.index}`;
    if (!stepPath || navigatedFor.current === key) return;
    navigatedFor.current = key;
    if (!isOnPath(stepPath, location)) navigate(stepPath);
  }, [stepPath, tour.guideId, tour.index, location, navigate]);

  // Follow the highlighted element: it may appear later (a form opening) or move (scrolling).
  const target = step?.target;
  useEffect(() => {
    const find = () => {
      const el = target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null;
      if (!el) {
        setRect(null);
        return;
      }
      const key = `${tour.guideId}:${tour.index}`;
      if (scrolledFor.current !== key) {
        scrolledFor.current = key;
        el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      }
      const next = el.getBoundingClientRect();
      setRect((prev) =>
        prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      );
    };
    find();
    const id = window.setInterval(find, POLL_MS);
    return () => window.clearInterval(id);
  }, [target, tour.guideId, tour.index]);

  // A tour for a guide that no longer exists ends itself.
  useEffect(() => {
    if (!steps || !step) onChange(null);
  }, [steps, step, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChange(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChange]);

  if (!steps || !step) return null;

  const total = steps.length;
  const last = tour.index === total - 1;
  const go = (index: number) => onChange({ guideId: tour.guideId, index });

  // Popover below the element when there is room, else above; centred when nothing is highlighted.
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const below = rect ? rect.bottom + RING_GAP + 12 : 0;
  const placeBelow = rect ? below + 180 < vh : false;
  const popoverStyle = rect
    ? placeBelow
      ? { top: below, left: Math.max(16, Math.min(rect.left, window.innerWidth - 336)) }
      : { bottom: vh - rect.top + RING_GAP + 12, left: Math.max(16, Math.min(rect.left, window.innerWidth - 336)) }
    : undefined;

  return (
    <>
      {rect && (
        <div
          aria-hidden="true"
          data-testid="tour-ring"
          className="pointer-events-none fixed z-50 rounded-lg ring-4 ring-primary ring-offset-2 transition-all motion-reduce:transition-none"
          style={{
            top: rect.top - RING_GAP,
            left: rect.left - RING_GAP,
            width: rect.width + RING_GAP * 2,
            height: rect.height + RING_GAP * 2,
          }}
        />
      )}
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        className={`fixed z-50 w-80 max-w-[calc(100vw-2rem)] space-y-3 rounded-lg border bg-white p-4 text-gray-900 shadow-xl print:hidden ${
          rect ? '' : 'bottom-4 start-1/2 -translate-x-1/2 rtl:translate-x-1/2'
        }`}
        style={popoverStyle}
      >
        <header className="space-y-1">
          <p className="text-xs text-gray-600">
            {t('assistant.tour.step', { n: tour.index + 1, total })}
          </p>
          <h2 id="tour-title" className="font-semibold">{t(`help.topics.${tour.guideId}.title`)}</h2>
        </header>
        <p id="tour-text" className="text-sm" aria-live="polite">{texts[tour.index]}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
            {t('assistant.tour.end')}
          </Button>
          <div className="flex gap-2">
            {tour.index > 0 && (
              <Button type="button" size="sm" variant="outline" onClick={() => go(tour.index - 1)}>
                {t('assistant.tour.back')}
              </Button>
            )}
            <Button type="button" size="sm" variant="primary" onClick={() => (last ? onChange(null) : go(tour.index + 1))}>
              {last ? t('assistant.tour.done') : t('assistant.tour.next')}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
