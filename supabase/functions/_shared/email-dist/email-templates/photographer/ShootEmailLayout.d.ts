import { type EmailColorConfig, type EmailFooterStrings } from '../BaseEmailTemplate.js';
/**
 * Shared body for the photographer automatic emails (quote sent, booking
 * confirmed, shoot reminder, thank-you, gallery ready). Every value is a
 * plain string so the Deno shell builder can swap in {{MS_*}} placeholders.
 */
export interface ShootEmailCommonProps {
    schoolName: string;
    schoolLogoUrl?: string;
    language: 'en' | 'he';
    colors?: EmailColorConfig;
    footerStrings?: EmailFooterStrings;
    strings?: Record<string, unknown>;
}
export interface ShootEmailRow {
    labelKey: string;
    value: string;
}
interface ShootEmailLayoutProps extends ShootEmailCommonProps {
    defaults: Record<string, string>;
    values: Record<string, string>;
    rows?: ShootEmailRow[];
    ctaHref?: string;
}
export default function ShootEmailLayout({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, defaults, values, rows, ctaHref, }: ShootEmailLayoutProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ShootEmailLayout.d.ts.map