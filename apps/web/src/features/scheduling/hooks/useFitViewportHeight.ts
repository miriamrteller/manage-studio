import { useLayoutEffect, useRef, useState } from 'react';

/** Minimum height so the calendar stays usable on very short screens. */
const DEFAULT_MIN_HEIGHT = 360;
/** Small gap left below the calendar so it isn't flush with the viewport edge. */
const DEFAULT_BOTTOM_GAP = 16;

/**
 * Sizes an element to fill the remaining viewport height from its current top
 * position, so the calendar fits on screen without the page scrolling. Recomputes
 * on window resize. Avoids brittle `calc(100dvh - Xrem)` offsets that don't account
 * for the app header, page heading, and footer.
 *
 * `bottomGap` reserves space below (e.g. a slot-button panel under the booking calendar).
 */
export function useFitViewportHeight<T extends HTMLElement>(
  minHeight = DEFAULT_MIN_HEIGHT,
  bottomGap = DEFAULT_BOTTOM_GAP,
) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    function update() {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setHeight(Math.max(minHeight, window.innerHeight - top - bottomGap));
    }
    update();
    // Recalculate after layout settles (fonts, service list, etc.).
    const t1 = window.setTimeout(update, 100);
    const t2 = window.setTimeout(update, 400);
    window.addEventListener('resize', update);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('resize', update);
    };
  }, [minHeight, bottomGap]);

  return { ref, height };
}
