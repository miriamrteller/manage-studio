import { supabase } from '@/lib/supabase';

const BUCKET = 'offering-images';
const CANONICAL_FILENAME = 'cover.webp';
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_DECODE_PX = 4096;
const MAX_OUTPUT_PX = 1200;

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const WEBP_RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46];
const WEBP_WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50];

export function offeringCoverPath(tenantId: string, offeringId: string): string {
  return `${tenantId}/${offeringId}/${CANONICAL_FILENAME}`;
}

function hasMagic(bytes: Uint8Array, magic: number[], offset = 0): boolean {
  return magic.every((value, idx) => bytes[offset + idx] === value);
}

function detectImageMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && hasMagic(bytes, JPEG_MAGIC)) return 'image/jpeg';
  if (bytes.length >= 4 && hasMagic(bytes, PNG_MAGIC)) return 'image/png';
  if (
    bytes.length >= 12 &&
    hasMagic(bytes, WEBP_RIFF_MAGIC) &&
    hasMagic(bytes, WEBP_WEBP_MAGIC, 8)
  ) {
    return 'image/webp';
  }
  return null;
}

function scaleSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_OUTPUT_PX) {
    return { width, height };
  }
  const ratio = MAX_OUTPUT_PX / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image.'));
    };
    img.src = url;
  });
}

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode image.'));
          return;
        }
        resolve(blob);
      },
      'image/webp',
      0.85,
    );
  });
}

export function getOfferingCoverPublicUrl(
  path: string | null | undefined,
  updatedAt?: string | null,
): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const base = data.publicUrl;
  if (!updatedAt) return base;
  return `${base}?v=${encodeURIComponent(updatedAt)}`;
}

export async function prepareCoverImageBlob(file: File): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('errors.image_too_large');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detectedMime = detectImageMime(bytes);
  if (!detectedMime) {
    throw new Error('errors.image_invalid_type');
  }

  const sourceBlob = new Blob([bytes], { type: detectedMime });
  const image = await loadImage(sourceBlob);
  if (image.width > MAX_DECODE_PX || image.height > MAX_DECODE_PX) {
    throw new Error('errors.image_dimensions');
  }

  const scaled = scaleSize(image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = scaled.width;
  canvas.height = scaled.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('errors.image_upload_failed');
  }

  ctx.drawImage(image, 0, 0, scaled.width, scaled.height);
  return canvasToWebp(canvas);
}

export async function uploadOfferingCover(
  tenantId: string,
  offeringId: string,
  file: File,
  previousPath?: string | null,
): Promise<string> {
  const path = offeringCoverPath(tenantId, offeringId);
  const blob = await prepareCoverImageBlob(file);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'image/webp',
    cacheControl: '3600',
  });

  if (error) {
    throw error;
  }

  if (previousPath && previousPath !== path) {
    await deleteOfferingCover(previousPath).catch(() => undefined);
  }

  return path;
}

export async function deleteOfferingCover(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    throw error;
  }
}
