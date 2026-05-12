import React from 'react';
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';

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
   * Color configuration object (preferred approach)
   * If provided, individual color props are ignored
   */
  colors?: EmailColorConfig;
  
  /**
   * Legacy individual color props (for backward compatibility)
   * Deprecated: Use colors object instead
   */
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  bgColor?: string;
  
  direction?: 'ltr' | 'rtl';
  
  /**
   * Footer customization (from tenant overrides)
   * If not provided, uses defaults
   */
  footerText?: string;
  copyrightText?: string;
}

/**
 * Default email colors
 * These match the CSS variable defaults and provide safe fallbacks
 * Adheres to .instructions.md: All colors via CSS variables
 */
const DEFAULT_EMAIL_COLORS: EmailColorConfig = {
  primary: 'var(--email-primary, #2563eb)',
  accent: 'var(--email-accent, #dc2626)',
  text: 'var(--email-text, #1f2937)',
  bg: 'var(--email-bg, #ffffff)',
  neutral: 'var(--email-neutral, #6b7280)',
};

/**
 * Base email template component
 * Provides consistent branding, header/footer, and RTL support
 * All color props use CSS custom properties (CSS variables) to allow tenant customization
 * 
 * Adheres to:
 * - SPEC.md 1.12: Tenant branding separate from code
 * - .instructions.md: No hardcoded colors, use CSS variables
 * - RTL support for Hebrew emails
 */
export default function BaseEmailTemplate({
  previewText,
  children,
  schoolName,
  schoolLogoUrl,
  colors,
  primaryColor,
  accentColor,
  textColor,
  bgColor,
  direction = 'ltr',
  footerText = 'Manage your notification preferences at',
  copyrightText,
}: BaseEmailTemplateProps) {
  const isRTL = direction === 'rtl';

  // Use colors object if provided, otherwise fall back to individual props or defaults
  const emailColors: EmailColorConfig = colors || {
    primary: primaryColor || DEFAULT_EMAIL_COLORS.primary,
    accent: accentColor || DEFAULT_EMAIL_COLORS.accent,
    text: textColor || DEFAULT_EMAIL_COLORS.text,
    bg: bgColor || DEFAULT_EMAIL_COLORS.bg,
    neutral: DEFAULT_EMAIL_COLORS.neutral,
  };

  const year = new Date().getFullYear();
  const defaultCopyright = `© ${year} ${schoolName}. All rights reserved.`;
  const displayCopyright = copyrightText || defaultCopyright;

  return (
    <Html lang={isRTL ? 'he' : 'en'} dir={direction}>
      <Head />
      <Preview>{previewText}</Preview>
      <Body
        style={{
          backgroundColor: emailColors.bg,
          fontFamily: '"Segoe UI", sans-serif',
          color: emailColors.text,
          lineHeight: '1.6',
        }}
      >
        <Container
          style={{
            maxWidth: '600px',
            margin: '0 auto',
            padding: '20px',
          }}
        >
          {/* Header */}
          <Section style={{ marginBottom: '30px', textAlign: 'center' }}>
            {schoolLogoUrl && (
              <Img
                src={schoolLogoUrl}
                alt={schoolName}
                style={{
                  height: '50px',
                  marginBottom: '10px',
                }}
              />
            )}
            <Text
              style={{
                fontSize: '24px',
                fontWeight: 'bold',
                margin: '10px 0',
                color: emailColors.primary,
              }}
            >
              {schoolName}
            </Text>
          </Section>

          {/* Main content */}
          <Section style={{ marginBottom: '30px' }}>
            {children}
          </Section>

          {/* Footer */}
          <Hr style={{ borderColor: '#e5e7eb', margin: '30px 0' }} />
          <Section style={{ textAlign: 'center', marginBottom: '20px' }}>
            <Text
              style={{
                fontSize: '12px',
                color: emailColors.neutral,
                margin: '5px 0',
              }}
            >
              {displayCopyright}
            </Text>
            <Text
              style={{
                fontSize: '12px',
                color: emailColors.neutral,
                margin: '5px 0',
              }}
            >
              {isRTL
                ? 'זו הודעה אוטומטית. אנא אל תשיב ישירות להודעה זו.'
                : 'This is an automated email. Please do not reply directly.'}
            </Text>
            <Text
              style={{
                fontSize: '12px',
                color: emailColors.neutral,
                margin: '10px 0 0 0',
              }}
            >
              {footerText}{' '}
              <Link
                href="https://manage-studio.app/preferences"
                style={{ color: emailColors.primary }}
              >
                manage-studio.app/preferences
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
