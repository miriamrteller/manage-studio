/**
 * Photo shop uploads: the photographer's browser turns each photo into a small
 * watermarked JPEG before upload, so originals never leave her computer.
 */

/** Longest edge of an uploaded preview, in pixels. */
export const PREVIEW_MAX_EDGE = 1200;
export const PREVIEW_QUALITY = 0.8;
export const PREVIEW_ACCEPT = 'image/jpeg,image/png,image/webp';

/** Scale (w, h) down so the longest edge is at most `max`; never up. */
export function previewSize(width: number, height: number, max = PREVIEW_MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max || longest <= 0) return { width: Math.round(width), height: Math.round(height) };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The watermark text: the studio's name, or a plain fallback. */
export function watermarkText(studioName: string | null | undefined): string {
  const name = (studioName ?? '').trim();
  return name ? `© ${name}` : '© PREVIEW';
}

export class PreviewError extends Error {
  constructor(public readonly code: 'unreadable' | 'failed') {
    super(code);
  }
}

/** Shrink and watermark one photo in the browser. Returns a JPEG blob. */
export async function makePreview(file: Blob, watermark: string): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // HEIC and other formats the browser can't read.
    throw new PreviewError('unreadable');
  }
  const { width, height } = previewSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PreviewError('failed');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  drawWatermark(ctx, width, height, watermark);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PREVIEW_QUALITY));
  if (!blob) throw new PreviewError('failed');
  return blob;
}

/** Diagonal text repeated across the whole photo, light with a dark edge so it shows on any picture. */
function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, text: string) {
  const fontSize = Math.max(18, Math.round(Math.min(width, height) / 10));
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(1, fontSize / 18);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  const diagonal = Math.hypot(width, height);
  const stepY = fontSize * 3;
  const stepX = Math.max(ctx.measureText(text).width + fontSize * 2, fontSize * 6);
  for (let y = -diagonal / 2; y <= diagonal / 2; y += stepY) {
    const offset = (Math.round(y / stepY) % 2) * (stepX / 2);
    for (let x = -diagonal / 2 - offset; x <= diagonal / 2; x += stepX) {
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    }
  }
  ctx.restore();
}
