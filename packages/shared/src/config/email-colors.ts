/**
 * Email Color Configuration
 * Provides tenant-customizable color defaults for email templates
 * Adheres to SPEC.md 1.12: Tenant branding separate from code
 * All colors default to CSS variables, fall back to hex values
 */

import { z } from 'zod';

/**
 * Email color configuration schema
 * All colors must be valid hex or CSS variable references
 * Aligns with BaseEmailTemplate props structure
 */
export const EmailColorConfigSchema = z.object({
  primary: z
    .string()
    .regex(/^(#[0-9A-F]{6}|var\(--.+\))$/i)
    .default('var(--email-primary, #2563eb)'),
  accent: z
    .string()
    .regex(/^(#[0-9A-F]{6}|var\(--.+\))$/i)
    .default('var(--email-accent, #dc2626)'),
  text: z
    .string()
    .regex(/^(#[0-9A-F]{6}|var\(--.+\))$/i)
    .default('var(--email-text, #1f2937)'),
  bg: z
    .string()
    .regex(/^(#[0-9A-F]{6}|var\(--.+\))$/i)
    .default('var(--email-bg, #ffffff)'),
  neutral: z
    .string()
    .regex(/^(#[0-9A-F]{6}|var\(--.+\))$/i)
    .default('var(--email-neutral, #6b7280)'),
});

export type EmailColorConfig = z.infer<typeof EmailColorConfigSchema>;

/**
 * Default email colors matching SPEC.md white-label defaults
 * These are used when tenant has no custom colors configured
 */
export const DEFAULT_EMAIL_COLORS: EmailColorConfig = {
  primary: 'var(--email-primary, #2563eb)',
  accent: 'var(--email-accent, #dc2626)',
  text: 'var(--email-text, #1f2937)',
  bg: 'var(--email-bg, #ffffff)',
  neutral: 'var(--email-neutral, #6b7280)',
};

/**
 * Get email colors for a tenant
 * Merges tenant-specific colors with defaults
 * @param tenantColors - Tenant config with primary_color, accent_color (from DB)
 * @returns Validated EmailColorConfig with all required fields
 */
export function getEmailColors(
  tenantColors?: {
    primary_color?: string | null;
    accent_color?: string | null;
  } | null,
): EmailColorConfig {
  const colors: Partial<EmailColorConfig> = { ...DEFAULT_EMAIL_COLORS };

  // Override with tenant colors if provided
  if (tenantColors?.primary_color) {
    colors.primary = tenantColors.primary_color;
  }
  if (tenantColors?.accent_color) {
    colors.accent = tenantColors.accent_color;
  }

  // Validate and return
  return EmailColorConfigSchema.parse(colors);
}

/**
 * Derive additional color variants from primary color
 * For future use in email template styling
 * Follows SPEC.md 1.12: Color Derivation pattern
 * @param primaryColor - Primary color hex value
 * @returns Object with derived color variants
 */
export function deriveEmailColorVariants(primaryColor: string) {
  return {
    primaryLight: `${primaryColor}20`, // 20% opacity
    primaryHover: `${primaryColor}dd`, // 90% opacity
    primaryActive: `${primaryColor}cc`, // 80% opacity
  };
}
