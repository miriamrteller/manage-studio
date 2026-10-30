/**
 * Gallery links are typed in by the studio and opened in a new tab by the
 * studio and its clients. Only absolute http(s) URLs are ever turned into a
 * link: javascript:, data:, relative paths and anything unparsable give null.
 */
export function safeGalleryUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? '';
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname) return null;
  return url.href;
}
