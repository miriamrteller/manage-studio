import type { Box } from './redactionBoxes';

/** Loads a picked image file so its pixels can be drawn. */
export function loadImage(file: Blob): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, revoke: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image could not be read'));
    };
    img.src = url;
  });
}

/**
 * Draws the boxes as opaque black rectangles INTO the image's pixels and returns a new PNG
 * file. The covered pixels are gone from the result (it is not an overlay). Re-encoding also
 * drops any hidden metadata the original carried, such as a phone photo's location.
 */
export async function burnBoxes(file: File, boxes: readonly Box[]): Promise<File> {
  const { img, revoke } = await loadImage(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas is not available');
    ctx.drawImage(img, 0, 0);
    ctx.fillStyle = '#000000';
    for (const b of boxes) ctx.fillRect(b.x, b.y, b.w, b.h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('image could not be saved');
    return new File([blob], 'screenshot.png', { type: 'image/png' });
  } finally {
    revoke();
  }
}
