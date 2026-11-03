// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { burnBoxes } from '@/components/ReportProblem/burnBoxes';

const calls = vi.hoisted(() => ({ fill: [] as number[][], styles: [] as string[], drawn: 0, encoded: '' }));

beforeEach(() => {
  calls.fill = [];
  calls.styles = [];
  calls.drawn = 0;
  calls.encoded = '';

  class FakeImage {
    naturalWidth = 300;
    naturalHeight = 150;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', FakeImage);
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();

  HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
    return {
      drawImage: () => {
        calls.drawn += 1;
      },
      fillRect: (...r: number[]) => calls.fill.push(r),
      set fillStyle(v: string) {
        calls.styles.push(v);
      },
    };
  }) as never;
  HTMLCanvasElement.prototype.toBlob = vi.fn(function (this: HTMLCanvasElement, cb: (blob: Blob | null) => void, type?: string) {
    calls.encoded = `${type}:${this.width}x${this.height}`;
    cb(new Blob(['png'], { type: type ?? 'image/png' }));
  }) as never;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('burnBoxes', () => {
  it('draws the image, then fills each box with opaque black, at the image\'s own size', async () => {
    const original = new File(['x'], 'Dana Levi phone.jpg', { type: 'image/jpeg' });
    const out = await burnBoxes(original, [
      { x: 10, y: 20, w: 100, h: 30 },
      { x: 0, y: 0, w: 50, h: 50 },
    ]);
    expect(calls.drawn).toBe(1);
    expect(calls.fill).toEqual([
      [10, 20, 100, 30],
      [0, 0, 50, 50],
    ]);
    expect(calls.styles).toEqual(['#000000']);
    expect(calls.encoded).toBe('image/png:300x150');
    // A new PNG with a generic name (the original name can hold a person's name).
    expect(out).not.toBe(original);
    expect(out.type).toBe('image/png');
    expect(out.name).toBe('screenshot.png');
  });

  it('releases the temporary object URL', async () => {
    await burnBoxes(new File(['x'], 'a.png', { type: 'image/png' }), []);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });

  it('fails clearly when the browser cannot save the image', async () => {
    HTMLCanvasElement.prototype.toBlob = vi.fn((cb: (blob: Blob | null) => void) => cb(null)) as never;
    await expect(burnBoxes(new File(['x'], 'a.png', { type: 'image/png' }), [])).rejects.toThrow('could not be saved');
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('fails clearly when there is no canvas', async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
    await expect(burnBoxes(new File(['x'], 'a.png', { type: 'image/png' }), [])).rejects.toThrow('canvas');
  });
});
