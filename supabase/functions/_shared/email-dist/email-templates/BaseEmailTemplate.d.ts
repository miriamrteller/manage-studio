import React from 'react';
/**
 * Email color configuration
 * All colors default to CSS variables with hex fallbacks
 * Adheres to SPEC.md 1.12: Tenant branding separate from code
 */
export interface EmailColorConfig {
    primary: string;
    accent: string;
    text: string;
    bg: string;
    neutral: string;
}
export interface EmailFooterStrings {
    copyright?: string;
    automated_notice?: string;
    preferences_link?: string;
    preferences_url?: string;
}
/**
 * Base email template properties
 * Follows schema-first approach from SPEC.md 1.13
 * All string props should eventually come from i18n (external to this component)
 */
interface BaseEmailTemplateProps {
    previewText: string;
    children: React.ReactNode;
    schoolName: string;
    schoolLogoUrl?: string;
    /**
     * Language (REQUIRED) - Used for i18n and computing direction
     * Direction is computed from this: language === 'he' ? 'rtl' : 'ltr'
     */
    language: 'en' | 'he';
    /**
     * Color configuration object (OPTIONAL)
     * If not provided, uses defaults
     */
    colors?: EmailColorConfig;
    /**
     * Footer strings (from i18n base.footer + tenant overrides)
     */
    footerStrings?: EmailFooterStrings;
}
/**
 * Base email template component
 * Provides consistent branding, header/footer, and RTL support
 */
export default function BaseEmailTemplate({ previewText, children, schoolName, schoolLogoUrl, language, colors, footerStrings, }: BaseEmailTemplateProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=BaseEmailTemplate.d.ts.map