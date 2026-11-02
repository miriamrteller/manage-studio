import { canvasToBlob, drawQr, qrMatrix } from './qr';

/** A4 at 150 dpi. */
export const POSTER_WIDTH = 1240;
export const POSTER_HEIGHT = 1754;

export interface PosterContent {
  studioName: string;
  /** Optional heading for a named form. */
  formTitle?: string | null;
  url: string;
  /** "Scan to enquire" in the main language, plus the other language below. */
  scanLine: string;
  scanLineOther?: string | null;
  logoUrl?: string | null;
  colour?: string | null;
  dir: 'ltr' | 'rtl';
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Logos are public storage URLs with CORS; without it the canvas would be
    // tainted and could not be exported, so a failure just leaves the logo out.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number, weight = '700') {
  let size = start;
  do {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  } while (size > 20);
}

/** Draw the poster: studio colour band, logo, name, QR code, "Scan to enquire", link. */
export async function renderPoster(content: PosterContent): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  const colour = content.colour && HEX_RE.test(content.colour) ? content.colour : '#5B6CFF';
  const cx = POSTER_WIDTH / 2;
  const maxText = POSTER_WIDTH - 160;
  ctx.direction = content.dir;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, POSTER_WIDTH, 40);
  ctx.fillRect(0, POSTER_HEIGHT - 40, POSTER_WIDTH, 40);

  let y = 140;
  if (content.logoUrl) {
    const logo = await loadImage(content.logoUrl);
    if (logo && logo.width > 0 && logo.height > 0) {
      const scale = Math.min(520 / logo.width, 200 / logo.height);
      const w = logo.width * scale;
      const h = logo.height * scale;
      ctx.drawImage(logo, cx - w / 2, y, w, h);
      y += h + 60;
    }
  }

  ctx.fillStyle = '#111827';
  fitText(ctx, content.studioName, maxText, 96);
  y += 90;
  ctx.fillText(content.studioName, cx, y);

  if (content.formTitle) {
    ctx.fillStyle = '#374151';
    fitText(ctx, content.formTitle, maxText, 60, '600');
    y += 80;
    ctx.fillText(content.formTitle, cx, y);
  }

  const qrSize = 720;
  y += 70;
  drawQr(ctx, qrMatrix(content.url), cx - qrSize / 2, y, qrSize);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 8;
  ctx.strokeRect(cx - qrSize / 2 - 12, y - 12, qrSize + 24, qrSize + 24);
  y += qrSize + 120;

  ctx.fillStyle = colour;
  fitText(ctx, content.scanLine, maxText, 88);
  ctx.fillText(content.scanLine, cx, y);
  if (content.scanLineOther) {
    ctx.fillStyle = '#374151';
    fitText(ctx, content.scanLineOther, maxText, 56, '600');
    y += 80;
    ctx.fillText(content.scanLineOther, cx, y);
  }

  ctx.fillStyle = '#4B5563';
  ctx.direction = 'ltr';
  fitText(ctx, content.url, maxText, 36, '400');
  ctx.fillText(content.url, cx, POSTER_HEIGHT - 110);
  return canvas;
}

export async function posterPng(content: PosterContent): Promise<Blob> {
  return canvasToBlob(await renderPoster(content), 'image/png');
}

/** The poster as a one-page A4 PDF (the drawn page as one JPEG image). */
export async function posterPdf(content: PosterContent): Promise<Blob> {
  const jpeg = await canvasToBlob(await renderPoster(content), 'image/jpeg', 0.92);
  return jpegPdf(new Uint8Array(await jpeg.arrayBuffer()), POSTER_WIDTH, POSTER_HEIGHT);
}

/**
 * Minimal PDF: one A4 page (595 × 842 pt) filled by one JPEG. Enough for a
 * printable poster without a PDF library; every reader opens it.
 */
export function jpegPdf(jpeg: Uint8Array, widthPx: number, heightPx: number): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, body: () => void) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    body();
    push('\nendobj\n');
  };
  const draw = 'q 595 0 0 842 0 0 cm /Im0 Do Q';

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  object(3, () =>
    push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'),
  );
  object(4, () => {
    push(
      `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    );
    push(jpeg);
    push('\nendstream');
  });
  object(5, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));

  const xref = length;
  let table = 'xref\n0 6\n0000000000 65535 f \n';
  for (let n = 1; n <= 5; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as unknown as ArrayBuffer[], { type: 'application/pdf' });
}
