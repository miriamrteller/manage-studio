import { describe, expect, it } from 'vitest';
import {
  MIN_BOX_SIZE,
  addBox,
  boxFromPoints,
  clearBoxes,
  cursorStep,
  moveCursor,
  pointerToImage,
  undoBox,
} from '@/components/ReportProblem/redactionBoxes';

const bounds = { w: 400, h: 200 };

describe('boxFromPoints', () => {
  it('makes the same box whichever corner comes first', () => {
    const a = boxFromPoints({ x: 10, y: 20 }, { x: 110, y: 70 }, bounds);
    const b = boxFromPoints({ x: 110, y: 70 }, { x: 10, y: 20 }, bounds);
    const c = boxFromPoints({ x: 110, y: 20 }, { x: 10, y: 70 }, bounds);
    expect(a).toEqual({ x: 10, y: 20, w: 100, h: 50 });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('keeps the box inside the image', () => {
    expect(boxFromPoints({ x: -50, y: -10 }, { x: 900, y: 500 }, bounds)).toEqual({ x: 0, y: 0, w: 400, h: 200 });
  });

  it('ignores a click or a sliver (smaller than the minimum in either direction)', () => {
    expect(boxFromPoints({ x: 50, y: 50 }, { x: 50, y: 50 }, bounds)).toBeNull();
    expect(boxFromPoints({ x: 50, y: 50 }, { x: 50 + MIN_BOX_SIZE - 1, y: 150 }, bounds)).toBeNull();
    expect(boxFromPoints({ x: 50, y: 50 }, { x: 150, y: 50 + MIN_BOX_SIZE - 1 }, bounds)).toBeNull();
    expect(boxFromPoints({ x: 50, y: 50 }, { x: 50 + MIN_BOX_SIZE, y: 50 + MIN_BOX_SIZE }, bounds)).not.toBeNull();
  });
});

describe('add / undo / clear', () => {
  const one = { x: 0, y: 0, w: 10, h: 10 };
  const two = { x: 20, y: 20, w: 10, h: 10 };

  it('adds boxes without changing the list it was given', () => {
    const start = [one];
    const next = addBox(start, two);
    expect(next).toEqual([one, two]);
    expect(start).toEqual([one]);
  });

  it('adding nothing keeps the boxes', () => {
    expect(addBox([one], null)).toEqual([one]);
  });

  it('undo removes only the last box, and is safe on an empty list', () => {
    expect(undoBox([one, two])).toEqual([one]);
    expect(undoBox([])).toEqual([]);
  });

  it('clear removes every box', () => {
    expect(clearBoxes()).toEqual([]);
  });
});

describe('keyboard cursor', () => {
  it('steps about 1% of the image, and 5 times that with Shift', () => {
    expect(cursorStep({ w: 400, h: 200 }, false)).toBe(2);
    expect(cursorStep({ w: 400, h: 200 }, true)).toBe(10);
    expect(cursorStep({ w: 20, h: 20 }, false)).toBe(1);
  });

  it('moves with the arrow keys and ignores other keys', () => {
    const start = { x: 100, y: 100 };
    expect(moveCursor(start, 'ArrowRight', bounds, false)).toEqual({ x: 102, y: 100 });
    expect(moveCursor(start, 'ArrowLeft', bounds, false)).toEqual({ x: 98, y: 100 });
    expect(moveCursor(start, 'ArrowUp', bounds, true)).toEqual({ x: 100, y: 90 });
    expect(moveCursor(start, 'ArrowDown', bounds, true)).toEqual({ x: 100, y: 110 });
    expect(moveCursor(start, 'a', bounds, false)).toBe(start);
  });

  it('never leaves the image', () => {
    expect(moveCursor({ x: 0, y: 0 }, 'ArrowLeft', bounds, true)).toEqual({ x: 0, y: 0 });
    expect(moveCursor({ x: 400, y: 200 }, 'ArrowRight', bounds, true)).toEqual({ x: 400, y: 200 });
    expect(moveCursor({ x: 400, y: 200 }, 'ArrowDown', bounds, true)).toEqual({ x: 400, y: 200 });
  });
});

describe('pointerToImage', () => {
  it('scales the pointer position from the displayed canvas to image pixels', () => {
    // A 400x200 image shown at half size, 100px from the left and 50px from the top of the page.
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    expect(pointerToImage({ x: 150, y: 100 }, rect, bounds)).toEqual({ x: 100, y: 100 });
    expect(pointerToImage({ x: 300, y: 150 }, rect, bounds)).toEqual({ x: 400, y: 200 });
  });

  it('clamps a pointer outside the canvas, and survives a zero-size canvas', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    expect(pointerToImage({ x: 0, y: 0 }, rect, bounds)).toEqual({ x: 0, y: 0 });
    expect(pointerToImage({ x: 9999, y: 9999 }, rect, bounds)).toEqual({ x: 400, y: 200 });
    expect(pointerToImage({ x: 5, y: 5 }, { left: 0, top: 0, width: 0, height: 0 }, bounds)).toEqual({ x: 0, y: 0 });
  });
});
