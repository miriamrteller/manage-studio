import qrcode from 'qrcode-generator';

/** QR modules for a URL (error correction M, smallest version that fits). */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** One SVG path for the dark modules (viewBox = size incl. a 4-module quiet zone). */
export function qrSvgPath(matrix: boolean[][], quiet = 4): { d: string; size: number } {
  let d = '';
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }),
  );
  return { d, size: matrix.length + quiet * 2 };
}

/** Draw the QR on a canvas: white square with quiet zone, dark modules. */
export function drawQr(ctx: CanvasRenderingContext2D, matrix: boolean[][], x: number, y: number, size: number, quiet = 4) {
  const cells = matrix.length + quiet * 2;
  const cell = size / cells;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#000000';
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect(x + (c + quiet) * cell, y + (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
    }),
  );
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image'))), type, quality),
  );
}

/** A square PNG of the QR code, for download. */
export async function qrPng(text: string, size = 1024): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  drawQr(ctx, qrMatrix(text), 0, 0, size);
  return canvasToBlob(canvas, 'image/png');
}

/** Start a browser download of a blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
