// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import en from '@/i18n/en.json';

const h = vi.hoisted(() => ({
  burned: [] as unknown[][],
  burnFails: false,
}));

const translate = (key: string, vars?: Record<string, unknown>) => {
  const raw = key.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], en);
  const text = typeof raw === 'string' ? raw : key;
  return text.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(vars?.[name] ?? ''));
};
// Like the real hook, the returned object and t are stable between renders.
const i18n = { t: translate };
vi.mock('react-i18next', () => ({ useTranslation: () => i18n }));

vi.mock('@/components/ReportProblem/burnBoxes', () => ({
  loadImage: vi.fn(async () => ({ img: { naturalWidth: 400, naturalHeight: 200 }, revoke: () => undefined })),
  burnBoxes: vi.fn(async (_file: File, boxes: unknown[]) => {
    h.burned.push(boxes);
    if (h.burnFails) throw new Error('nope');
    return new File(['burned'], 'screenshot.png', { type: 'image/png' });
  }),
}));

import { ScreenshotRedactor } from '@/components/ReportProblem/ScreenshotRedactor';

const rp = en.report_problem;
const original = new File(['orig'], 'orig.png', { type: 'image/png' });

beforeEach(() => {
  h.burned = [];
  h.burnFails = false;
  // jsdom has no layout: show the 400x200 image at its own size, at the page origin.
  HTMLCanvasElement.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  HTMLCanvasElement.prototype.getContext = (() => null) as never; // painting is skipped; the logic is what is tested
});
afterEach(cleanup);

async function open(onDone = vi.fn(), onCancel = vi.fn()) {
  render(<ScreenshotRedactor file={original} onDone={onDone} onCancel={onCancel} />);
  const canvas = await screen.findByLabelText(rp.redact_canvas_label);
  return { canvas, onDone, onCancel };
}

const key = (el: Element, k: string, init: Record<string, unknown> = {}) => fireEvent.keyDown(el, { key: k, ...init });

describe('ScreenshotRedactor', () => {
  it('has a labelled, focusable drawing area with instructions, focused on open', async () => {
    const { canvas } = await open();
    expect(canvas.getAttribute('tabindex')).toBe('0');
    expect(canvas.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(canvas.getAttribute('aria-describedby') as string)?.textContent).toBe(rp.redact_help);
    await waitFor(() => expect(document.activeElement).toBe(canvas));
  });

  it('draws a box with the keyboard and announces it', async () => {
    const { canvas } = await open();
    // The cursor starts in the middle (200,100). Step is 2px (1% of the shorter side), 10px with Shift.
    key(canvas, 'Enter'); // first corner
    expect(screen.getByRole('status').textContent).toBe(rp.redact_corner_set);
    for (let i = 0; i < 10; i++) key(canvas, 'ArrowRight');
    for (let i = 0; i < 10; i++) key(canvas, 'ArrowDown');
    key(canvas, ' '); // opposite corner
    expect(screen.getByTestId('redact-count').textContent).toBe('Boxes: 1');
    expect(screen.getByRole('status').textContent).toBe('Box added. Boxes: 1.');
  });

  it('Shift makes bigger steps', async () => {
    const { canvas, onDone } = await open();
    key(canvas, 'Enter');
    key(canvas, 'ArrowRight', { shiftKey: true });
    key(canvas, 'ArrowDown', { shiftKey: true });
    key(canvas, 'Enter');
    fireEvent.click(screen.getByRole('button', { name: rp.redact_done }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(h.burned[0]).toEqual([{ x: 200, y: 100, w: 10, h: 10 }]);
  });

  it('Escape cancels a half-drawn box without closing anything else', async () => {
    const { canvas } = await open();
    key(canvas, 'Enter');
    const notCancelled = fireEvent.keyDown(canvas, { key: 'Escape' });
    expect(notCancelled).toBe(false); // default prevented: the dialog does not close
    expect(screen.getByRole('status').textContent).toBe(rp.redact_corner_cancelled);
    key(canvas, 'ArrowRight');
    key(canvas, 'ArrowDown');
    key(canvas, 'Enter'); // starts a NEW first corner, so no box yet
    expect(screen.getByTestId('redact-count').textContent).toBe('Boxes: 0');
  });

  it('Escape with nothing half-drawn is left alone', async () => {
    const { canvas } = await open();
    expect(fireEvent.keyDown(canvas, { key: 'Escape' })).toBe(true);
  });

  async function drawOne(canvas: Element, size = 5) {
    key(canvas, 'Enter');
    for (let i = 0; i < size; i++) {
      key(canvas, 'ArrowRight');
      key(canvas, 'ArrowDown');
    }
    key(canvas, 'Enter');
  }

  it('undo removes the last box (button, Backspace and Ctrl+Z); clear removes all', async () => {
    const { canvas } = await open();
    await drawOne(canvas);
    await drawOne(canvas);
    await drawOne(canvas);
    expect(screen.getByTestId('redact-count').textContent).toBe('Boxes: 3');
    fireEvent.click(screen.getByRole('button', { name: rp.redact_undo }));
    expect(screen.getByTestId('redact-count').textContent).toBe('Boxes: 2');
    key(canvas, 'Backspace');
    expect(screen.getByTestId('redact-count').textContent).toBe('Boxes: 1');
    await drawOne(canvas);
    key(canvas, 'z', { ctrlKey: true });
    expect(screen.getByTestId('redact-count').textContent).toBe('Boxes: 1');
    fireEvent.click(screen.getByRole('button', { name: rp.redact_clear }));
    expect(screen.getByTestId('redact-count').textContent).toBe('Boxes: 0');
    expect(screen.getByRole('status').textContent).toBe(rp.redact_cleared);
    expect((screen.getByRole('button', { name: rp.redact_clear }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: rp.redact_undo }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('draws a box by dragging with the mouse or touch', async () => {
    const { canvas, onDone } = await open();
    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 30, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 140, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 140, clientY: 80, pointerId: 1 });
    expect(screen.getByTestId('redact-count').textContent).toBe('Boxes: 1');
    fireEvent.click(screen.getByRole('button', { name: rp.redact_done }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(h.burned[0]).toEqual([{ x: 40, y: 30, w: 100, h: 50 }]);
  });

  it('a stray click does not make a box', async () => {
    const { canvas } = await open();
    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 41, clientY: 31, pointerId: 1 });
    expect(screen.getByTestId('redact-count').textContent).toBe('Boxes: 0');
  });

  it('Done with no boxes hands back the original file untouched (nothing is re-encoded)', async () => {
    const { onDone } = await open();
    fireEvent.click(screen.getByRole('button', { name: rp.redact_done }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(original));
    expect(h.burned).toHaveLength(0);
  });

  it('Done with boxes hands back the new image with the boxes burned in', async () => {
    const { canvas, onDone } = await open();
    await drawOne(canvas);
    fireEvent.click(screen.getByRole('button', { name: rp.redact_done }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const result = onDone.mock.calls[0][0] as File;
    expect(result).not.toBe(original);
    expect(result.name).toBe('screenshot.png');
    expect(h.burned).toHaveLength(1);
  });

  it('shows an announced error when the boxes cannot be applied, and stays open', async () => {
    h.burnFails = true;
    const { canvas, onDone } = await open();
    await drawOne(canvas);
    fireEvent.click(screen.getByRole('button', { name: rp.redact_done }));
    expect((await screen.findByRole('alert')).textContent).toBe(rp.redact_error);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Cancel leaves the image as it was', async () => {
    const { onDone, onCancel } = await open();
    fireEvent.click(screen.getByRole('button', { name: rp.redact_cancel }));
    expect(onCancel).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
