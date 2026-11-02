import { deriveEmailBrand } from "./email-dist/email/brand.js";

/** Placeholders the shell builders leave for the gradient colours (scripts/lib-email-brand-shell.mjs). */
const BRAND_FILL = "{{BRAND_FILL}}";
const BRAND_END = "{{BRAND_END}}";

/**
 * Fill a pre-built email shell's brand gradient (header band, button, code) from the
 * studio's colours: the AA-safe fill (also the solid bgcolor fallback for Outlook and
 * clients without gradients) and the shifted end colour.
 */
export function applyEmailBrand(html: string, primaryColor: string, accentColor: string): string {
  const brand = deriveEmailBrand(primaryColor, accentColor);
  return html.split(BRAND_FILL).join(brand.fill).split(BRAND_END).join(brand.end);
}
