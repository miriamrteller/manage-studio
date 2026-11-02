/**
 * Email-safe brand colours: the gradient behind the header band, the primary
 * button and the sign-in code.
 *
 * Pure and dependency-free so the Edge Functions (Deno, via email-dist) and the
 * shell build script compute the same values. `fill` is the primary, darkened
 * only as far as needed for white text at WCAG AA; `end` is the fill shifted
 * 25% toward the anchor (OpalSwift: its purple; a studio: its accent), again
 * kept AA with white. Clients without gradient support show `fill` (the
 * bgcolor fallback), so white text is AA there too.
 */
export declare const OPALSWIFT_EMAIL_FILL = "#4A58E8";
export declare const OPALSWIFT_EMAIL_ANCHOR = "#9333D6";
/** WCAG contrast of white text on `bg`. */
export declare function whiteContrast(bg: string): number;
export interface EmailBrand {
    fill: string;
    end: string;
}
export declare function deriveEmailBrand(primary: string, anchor: string): EmailBrand;
/** CSS for a gradient surface; every client that ignores it falls back to `bgcolor`/`backgroundColor`. */
export declare function emailGradient(brand: EmailBrand): string;
export declare const OPALSWIFT_EMAIL_BRAND: EmailBrand;
//# sourceMappingURL=brand.d.ts.map