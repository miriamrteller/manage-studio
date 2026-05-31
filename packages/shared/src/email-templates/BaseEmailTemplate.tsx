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
 * Default email colors
 * These match the CSS variable defaults and provide safe fallbacks
 */
const DEFAULT_EMAIL_COLORS: EmailColorConfig = {
  primary: '#2563eb',
  accent: '#dc2626',
  text: '#1f2937',
  bg: '#f9fafb',
  neutral: '#6b7280',
};

const DEFAULT_FOOTER: EmailFooterStrings = {
  automated_notice: 'This is an automated email. Please do not reply directly.',
  preferences_link: 'Manage your notification preferences at',
  preferences_url: 'https://manage-studio.app/preferences',
};

/**
 * Base email template component
 * Provides consistent branding, header/footer, and RTL support
 */
export default function BaseEmailTemplate({
  previewText,
  children,
  schoolName,
  schoolLogoUrl,
  language,
  colors,
  footerStrings,
}: BaseEmailTemplateProps) {
  const dir = language === 'he' ? 'rtl' : 'ltr';

  const emailColors: EmailColorConfig = colors
    ? {
        ...colors,
        primary: colors.primary.startsWith('var(')
          ? colors.primary.replace(/var\(--email-primary,\s*([^)]+)\)/, '$1').trim()
          : colors.primary,
        accent: colors.accent.startsWith('var(')
          ? colors.accent.replace(/var\(--email-accent,\s*([^)]+)\)/, '$1').trim()
          : colors.accent,
        text: colors.text.startsWith('var(')
          ? colors.text.replace(/var\(--email-text,\s*([^)]+)\)/, '$1').trim()
          : colors.text,
        bg: colors.bg.startsWith('var(')
          ? colors.bg.replace(/var\(--email-bg,\s*([^)]+)\)/, '$1').trim()
          : colors.bg,
        neutral: colors.neutral.startsWith('var(')
          ? colors.neutral.replace(/var\(--email-neutral,\s*([^)]+)\)/, '$1').trim()
          : colors.neutral,
      }
    : DEFAULT_EMAIL_COLORS;

  const footer = { ...DEFAULT_FOOTER, ...footerStrings };
  const year = new Date().getFullYear();
  const displayCopyright =
    footer.copyright?.replace('{year}', String(year)).replace('{schoolName}', schoolName) ??
    `© ${year} ${schoolName}. All rights reserved.`;

  const preferencesUrl = footer.preferences_url ?? DEFAULT_FOOTER.preferences_url!;

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
          backgroundColor: '#f3f4f6',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: emailColors.text,
          lineHeight: '1.6',
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container
          style={{
            maxWidth: '600px',
            margin: '0 auto',
            padding: '0 16px',
          }}
        >
          <Section
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            <Section
              style={{
                backgroundColor: emailColors.primary,
                padding: '28px 32px',
                textAlign: 'center',
              }}
            >
              {schoolLogoUrl ? (
                <Img
                  src={schoolLogoUrl}
                  alt={schoolName}
                  style={{
                    height: '48px',
                    margin: '0 auto 12px',
                    display: 'block',
                  }}
                />
              ) : null}
              <Text
                style={{
                  fontSize: '22px',
                  fontWeight: 'bold',
                  margin: 0,
                  color: '#ffffff',
                }}
              >
                {schoolName}
              </Text>
            </Section>

            <Section style={{ padding: '32px' }}>{children}</Section>
          </Section>

          <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0' }} />
          <Section style={{ textAlign: 'center', paddingBottom: '16px' }}>
            <Text
              style={{
                fontSize: '12px',
                color: emailColors.neutral,
                margin: '4px 0',
              }}
            >
              {displayCopyright}
            </Text>
            <Text
              style={{
                fontSize: '12px',
                color: emailColors.neutral,
                margin: '4px 0',
              }}
            >
              {footer.automated_notice}
            </Text>
            <Text
              style={{
                fontSize: '12px',
                color: emailColors.neutral,
                margin: '8px 0 0 0',
              }}
            >
              {footer.preferences_link}{' '}
              <Link
                href={preferencesUrl}
                style={{ color: emailColors.primary }}
              >
                {preferencesUrl.replace(/^https?:\/\//, '')}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
