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
 * Direction is computed from language prop and inherited via CSS cascade
 * 
 * Adheres to:
 * - SPEC.md 1.12: Tenant branding separate from code
 * - .instructions.md: No hardcoded colors, use CSS variables
 * - W3C/WCAG: Direction computed once at root level, inherited by children
 */
export default function BaseEmailTemplate({
  previewText,
  children,
  schoolName,
  schoolLogoUrl,
  language,
  colors,
  footerText = 'Manage your notification preferences at',
  copyrightText,
}: BaseEmailTemplateProps) {
  // Compute direction ONLY from language (single source of truth)
  const dir = language === 'he' ? 'rtl' : 'ltr';

  // Use colors object if provided, otherwise use defaults
  const emailColors: EmailColorConfig = colors || {
    primary: DEFAULT_EMAIL_COLORS.primary,
    accent: DEFAULT_EMAIL_COLORS.accent,
    text: DEFAULT_EMAIL_COLORS.text,
    bg: DEFAULT_EMAIL_COLORS.bg,
    neutral: DEFAULT_EMAIL_COLORS.neutral,
  };

  const year = new Date().getFullYear();
  const defaultCopyright = `© ${year} ${schoolName}. All rights reserved.`;
  const displayCopyright = copyrightText || defaultCopyright;

  return (
    <Html lang={language} dir={dir}>
      <Head>
        <style>{`
          :root {
            --email-primary: ${emailColors.primary};
            --email-accent: ${emailColors.accent};
            --email-text: ${emailColors.text};
            --email-bg: ${emailColors.bg};
            --email-neutral: ${emailColors.neutral};
          }
        `}</style>
      </Head>
      <Preview>{previewText}</Preview>
      <Body
        style={{
          backgroundColor: 'var(--email-bg)',
          fontFamily: '"Segoe UI", sans-serif',
          color: 'var(--email-text)',
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
                color: 'var(--email-primary)',
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
                color: 'var(--email-neutral)',
                margin: '5px 0',
              }}
            >
              {displayCopyright}
            </Text>
            <Text
              style={{
                fontSize: '12px',
                color: 'var(--email-neutral)',
                margin: '5px 0',
              }}
            >
              This is an automated email. Please do not reply directly.
            </Text>
            <Text
              style={{
                fontSize: '12px',
                color: 'var(--email-neutral)',
                margin: '10px 0 0 0',
              }}
            >
              {footerText}{' '}
              <Link
                href="https://manage-studio.app/preferences"
                style={{ color: 'var(--email-primary)' }}
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
