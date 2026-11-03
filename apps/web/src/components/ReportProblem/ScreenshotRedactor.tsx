import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { burnBoxes, loadImage } from './burnBoxes';
import {
  addBox,
  boxFromPoints,
  clearBoxes,
  moveCursor,
  pointerToImage,
  undoBox,
  type Box,
  type Point,
  type Size,
} from './redactionBoxes';

interface ScreenshotRedactorProps {
  file: File;
  /** Called with the image with the boxes burned in, or the original file when no boxes were drawn. */
  onDone: (file: File) => void;
  onCancel: () => void;
}

/**
 * "Hide details": draw solid black boxes over parts of the attached screenshot, then press Done.
 * Mouse and touch: drag. Keyboard: arrow keys move a cursor (Shift = bigger steps), Enter or Space
 * sets the first corner and then the opposite corner, Escape cancels a half-drawn box,
 * Backspace/Delete or Ctrl+Z undoes the last box.
 */
export function ScreenshotRedactor({ file, onDone, onCancel }: ScreenshotRedactorProps) {
  const { t } = useTranslation();
  // Read through a ref so the image-load effect below only re-runs when the file changes.
  const tRef = useRef(t);
  tRef.current = t;
  const ids = useId();
  const helpId = `${ids}-help`;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [size, setSize] = useState<Size | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [drag, setDrag] = useState<{ from: Point; to: Point } | null>(null);
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const [anchor, setAnchor] = useState<Point | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the picked image.
  useEffect(() => {
    let cancelled = false;
    let revoke: (() => void) | undefined;
    loadImage(file)
      .then(({ img, revoke: r }) => {
        revoke = r;
        if (cancelled) return;
        imgRef.current = img;
        setSize({ w: img.naturalWidth, h: img.naturalHeight });
        setCursor({ x: Math.round(img.naturalWidth / 2), y: Math.round(img.naturalHeight / 2) });
      })
      .catch(() => {
        if (!cancelled) setError(tRef.current('report_problem.redact_error'));
      });
    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [file]);

  // Focus the drawing area once the image is ready.
  useEffect(() => {
    if (size) canvasRef.current?.focus();
  }, [size]);

  // Paint: the image, the boxes, the box being drawn, and the keyboard cursor.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !size) return;
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    ctx.fillStyle = '#000000';
    for (const b of boxes) ctx.fillRect(b.x, b.y, b.w, b.h);

    const lineWidth = Math.max(2, Math.round(Math.min(size.w, size.h) / 300));
    const pending = drag
      ? boxFromPoints(drag.from, drag.to, size)
      : anchor
        ? boxFromPoints(anchor, cursor, size)
        : null;
    if (pending) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(pending.x, pending.y, pending.w, pending.h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = lineWidth;
      ctx.setLineDash?.([lineWidth * 4, lineWidth * 3]);
      ctx.strokeRect(pending.x, pending.y, pending.w, pending.h);
      ctx.setLineDash?.([]);
    }
    if (anchor || document.activeElement === canvas) {
      const arm = lineWidth * 6;
      ctx.lineWidth = lineWidth + 2;
      ctx.strokeStyle = '#000000';
      ctx.beginPath();
      ctx.moveTo(cursor.x - arm, cursor.y);
      ctx.lineTo(cursor.x + arm, cursor.y);
      ctx.moveTo(cursor.x, cursor.y - arm);
      ctx.lineTo(cursor.x, cursor.y + arm);
      ctx.stroke();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
  }, [boxes, drag, anchor, cursor, size]);

  const commitBox = useCallback(
    (from: Point, to: Point) => {
      if (!size) return;
      const box = boxFromPoints(from, to, size);
      if (!box) return;
      setBoxes((prev) => {
        const next = addBox(prev, box);
        setAnnouncement(t('report_problem.redact_added', { count: next.length }));
        return next;
      });
    },
    [size, t],
  );

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!size) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const at = pointerToImage({ x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect(), size);
    setAnchor(null);
    setCursor(at);
    setDrag({ from: at, to: at });
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!size || !drag) return;
    const at = pointerToImage({ x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect(), size);
    setDrag({ from: drag.from, to: at });
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!size || !drag) return;
    const at = pointerToImage({ x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect(), size);
    commitBox(drag.from, at);
    setCursor(at);
    setDrag(null);
  };

  const undo = () => {
    setBoxes((prev) => {
      const next = undoBox(prev);
      setAnnouncement(t('report_problem.redact_undone', { count: next.length }));
      return next;
    });
  };

  const clear = () => {
    setBoxes(clearBoxes());
    setAnchor(null);
    setAnnouncement(t('report_problem.redact_cleared'));
    canvasRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (!size) return;
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      setCursor((c) => moveCursor(c, e.key, size, e.shiftKey));
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!anchor) {
        setAnchor(cursor);
        setAnnouncement(t('report_problem.redact_corner_set'));
      } else {
        commitBox(anchor, cursor);
        setAnchor(null);
      }
      return;
    }
    if (e.key === 'Escape' && anchor) {
      // Cancel the half-drawn box only; do not let Escape close the whole dialog.
      e.preventDefault();
      e.stopPropagation();
      setAnchor(null);
      setAnnouncement(t('report_problem.redact_corner_cancelled'));
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z')) {
      e.preventDefault();
      undo();
    }
  };

  const done = async () => {
    if (boxes.length === 0) {
      onDone(file);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await burnBoxes(file, boxes));
    } catch {
      setError(t('report_problem.redact_error'));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="screenshot-redactor">
      <h3 className="text-base font-semibold">{t('report_problem.redact_title')}</h3>
      <p id={helpId} className="text-sm text-muted-foreground">
        {t('report_problem.redact_help')}
      </p>

      {size ? (
        <canvas
          ref={canvasRef}
          tabIndex={0}
          // A custom drawing widget that handles its own arrow, Enter and Escape keys:
          // role="application" tells screen readers to pass those keys through instead of reading the page.
          // eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role
          role="application"
          aria-label={t('report_problem.redact_canvas_label')}
          aria-describedby={helpId}
          className="max-h-[50vh] w-full touch-none rounded-md border object-contain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={onKeyDown}
          onFocus={() => setCursor((c) => ({ ...c }))}
          onBlur={() => setCursor((c) => ({ ...c }))}
        />
      ) : (
        !error && <p className="text-sm">{t('report_problem.redact_loading')}</p>
      )}

      <div aria-live="polite" role="status" className="min-h-5 text-sm">
        {announcement}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm" data-testid="redact-count">
          {t('report_problem.redact_count', { count: boxes.length })}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={undo} disabled={boxes.length === 0 || busy}>
          {t('report_problem.redact_undo')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={boxes.length === 0 || busy}>
          {t('report_problem.redact_clear')}
        </Button>
        <span className="ms-auto flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            {t('report_problem.redact_cancel')}
          </Button>
          <Button type="button" variant="primary" onClick={done} isLoading={busy} disabled={!size || busy}>
            {t('report_problem.redact_done')}
          </Button>
        </span>
      </div>
    </div>
  );
}
