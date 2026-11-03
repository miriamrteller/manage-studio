/**
 * Pure helpers for the "Hide details" editor: solid boxes drawn over an attached
 * screenshot. All coordinates are in the image's own pixels. Kept free of DOM and
 * canvas so they are easy to test.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Boxes smaller than this (in image pixels) are treated as a stray click, not a box. */
export const MIN_BOX_SIZE = 4;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function clampPoint(p: Point, bounds: Size): Point {
  return { x: clamp(Math.round(p.x), 0, bounds.w), y: clamp(Math.round(p.y), 0, bounds.h) };
}

/** The box between two corners (in any order), kept inside the image; null when it is too small. */
export function boxFromPoints(a: Point, b: Point, bounds: Size): Box | null {
  const p = clampPoint(a, bounds);
  const q = clampPoint(b, bounds);
  const box = {
    x: Math.min(p.x, q.x),
    y: Math.min(p.y, q.y),
    w: Math.abs(p.x - q.x),
    h: Math.abs(p.y - q.y),
  };
  return box.w >= MIN_BOX_SIZE && box.h >= MIN_BOX_SIZE ? box : null;
}

export function addBox(boxes: readonly Box[], box: Box | null): Box[] {
  return box ? [...boxes, box] : [...boxes];
}

export function undoBox(boxes: readonly Box[]): Box[] {
  return boxes.slice(0, -1);
}

export function clearBoxes(): Box[] {
  return [];
}

/** How far one arrow key press moves the keyboard cursor: about 1% of the image, 5 times that with Shift. */
export function cursorStep(bounds: Size, shift: boolean): number {
  const base = Math.max(1, Math.round(Math.min(bounds.w, bounds.h) / 100));
  return shift ? base * 5 : base;
}

/** Moves the keyboard cursor for an arrow key; any other key leaves it where it is. */
export function moveCursor(cursor: Point, key: string, bounds: Size, shift: boolean): Point {
  const step = cursorStep(bounds, shift);
  switch (key) {
    case 'ArrowLeft':
      return clampPoint({ x: cursor.x - step, y: cursor.y }, bounds);
    case 'ArrowRight':
      return clampPoint({ x: cursor.x + step, y: cursor.y }, bounds);
    case 'ArrowUp':
      return clampPoint({ x: cursor.x, y: cursor.y - step }, bounds);
    case 'ArrowDown':
      return clampPoint({ x: cursor.x, y: cursor.y + step }, bounds);
    default:
      return cursor;
  }
}

/** Maps a pointer position on the displayed canvas to image pixels. */
export function pointerToImage(
  client: Point,
  rect: { left: number; top: number; width: number; height: number },
  bounds: Size,
): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return clampPoint(
    {
      x: ((client.x - rect.left) / rect.width) * bounds.w,
      y: ((client.y - rect.top) / rect.height) * bounds.h,
    },
    bounds,
  );
}
