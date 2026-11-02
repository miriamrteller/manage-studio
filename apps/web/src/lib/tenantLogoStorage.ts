/**
 * Where studio logos are stored. Each upload gets its own file name, so a new
 * logo has a new URL: browsers and the CDN can never show the previous file
 * under the same address (they cache for up to an hour). Because a name is
 * never reused, the file can be cached for a long time.
 */
export const TENANT_ASSETS_BUCKET = 'tenant-assets';
export const LOGO_CACHE_SECONDS = String(60 * 60 * 24 * 365);

export function logoObjectPath(
  tenantId: string,
  variant: 'light' | 'dark',
  fileName: string,
  now: number = Date.now(),
): string {
  const parts = fileName.split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, '') || 'png' : 'png';
  return `${tenantId}/${variant === 'light' ? 'logo' : 'logo-dark'}-${now}.${ext}`;
}

/**
 * The stored object behind one of this studio's logo URLs, so the old file
 * can be removed once it's replaced. Null for anything else (another
 * bucket, another studio, not a logo).
 */
export function logoPathFromUrl(url: string | null | undefined, tenantId: string): string | null {
  if (!url) return null;
  const marker = `/object/public/${TENANT_ASSETS_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const path = decodeURIComponent(url.slice(at + marker.length).split(/[?#]/)[0]);
  return path.startsWith(`${tenantId}/logo`) && !path.includes('..') ? path : null;
}
