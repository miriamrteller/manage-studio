import type { EmailBrand } from '../../email/brand.js';
/**
 * Gradient colours for the email being rendered, or null for the flat primary
 * colour (the look every email had before). BaseEmailTemplate provides it; only
 * emails that opt in with `gradient` get a value.
 */
export declare const EmailBrandContext: import("react").Context<EmailBrand | null>;
export declare const useEmailBrand: () => EmailBrand | null;
//# sourceMappingURL=brand.d.ts.map