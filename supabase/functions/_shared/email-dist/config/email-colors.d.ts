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
export declare const EmailColorConfigSchema: z.ZodObject<{
    primary: z.ZodDefault<z.ZodString>;
    accent: z.ZodDefault<z.ZodString>;
    text: z.ZodDefault<z.ZodString>;
    bg: z.ZodDefault<z.ZodString>;
    neutral: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    primary: string;
    accent: string;
    text: string;
    bg: string;
    neutral: string;
}, {
    primary?: string | undefined;
    accent?: string | undefined;
    text?: string | undefined;
    bg?: string | undefined;
    neutral?: string | undefined;
}>;
export type EmailColorConfig = z.infer<typeof EmailColorConfigSchema>;
/**
 * Default email colors matching SPEC.md white-label defaults
 * These are used when tenant has no custom colors configured
 */
export declare const DEFAULT_EMAIL_COLORS: EmailColorConfig;
/**
 * Get email colors for a tenant
 * Merges tenant-specific colors with defaults
 * @param tenantColors - Tenant config with primary_color, accent_color (from DB)
 * @returns Validated EmailColorConfig with all required fields
 */
export declare function getEmailColors(tenantColors?: {
    primary_color?: string | null;
    accent_color?: string | null;
} | null): EmailColorConfig;
/**
 * Derive additional color variants from primary color
 * For future use in email template styling
 * Follows SPEC.md 1.12: Color Derivation pattern
 * @param primaryColor - Primary color hex value
 * @returns Object with derived color variants
 */
export declare function deriveEmailColorVariants(primaryColor: string): {
    primaryLight: string;
    primaryHover: string;
    primaryActive: string;
};
//# sourceMappingURL=email-colors.d.ts.map