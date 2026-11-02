/**
 * Shared by the email shell builders: shells are rendered once at build time with
 * sentinel colours, then colours are filled in at send time. The brand gradient
 * (header band, button, code) uses AA-safe colours derived from the studio's
 * primary/accent (packages/shared/src/email/brand.ts), so they get their own
 * placeholders, filled by supabase/functions/_shared/email-brand.ts.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BRAND_PLACEHOLDER = { fill: '{{BRAND_FILL}}', end: '{{BRAND_END}}' };

export async function brandShellHtml(html, root, buildPrimary, buildAccent) {
  const { deriveEmailBrand } = await import(
    pathToFileURL(join(root, 'packages/shared/dist/email/brand.js')).href
  );
  const brand = deriveEmailBrand(buildPrimary, buildAccent);
  if (brand.fill.toLowerCase() === buildPrimary || brand.end.toLowerCase() === buildAccent) {
    throw new Error('Build colours must differ from the derived gradient colours');
  }
  if (!html.includes(brand.fill)) {
    throw new Error('Shell has no brand gradient; BaseEmailTemplate must render it');
  }
  return html
    .split(brand.fill).join(BRAND_PLACEHOLDER.fill)
    .split(brand.end).join(BRAND_PLACEHOLDER.end);
}
