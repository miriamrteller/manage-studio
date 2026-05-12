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

interface BaseEmailTemplateProps {
  previewText: string;
  children: React.ReactNode;
  schoolName: string;
  schoolLogoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  bgColor?: string;
  direction?: 'ltr' | 'rtl';
}

/**
 * Base email template component
 * Provides consistent branding, header/footer, and RTL support
 * All color props use CSS custom properties (CSS variables) to allow tenant customization
 */
export default function BaseEmailTemplate({
  previewText,
  children,
  schoolName,
  schoolLogoUrl,
  primaryColor = 'var(--email-primary, #2563eb)',
  accentColor = 'var(--email-accent, #dc2626)',
  textColor = 'var(--email-text, #1f2937)',
  bgColor = 'var(--email-bg, #ffffff)',
  direction = 'ltr',
}: BaseEmailTemplateProps) {
  const isRTL = direction === 'rtl';

  return (
    <Html lang={isRTL ? 'he' : 'en'} dir={direction}>
      <Head />
      <Preview>{previewText}</Preview>
      <Body
        style={{
          backgroundColor: bgColor,
          fontFamily: '"Segoe UI", sans-serif',
          color: textColor,
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
                color: primaryColor,
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
                color: '#6b7280',
                margin: '5px 0',
              }}
            >
              © {new Date().getFullYear()} {schoolName}. All rights reserved.
            </Text>
            <Text
              style={{
                fontSize: '12px',
                color: '#6b7280',
                margin: '5px 0',
              }}
            >
              This is an automated email. Please do not reply directly.
            </Text>
            <Text
              style={{
                fontSize: '12px',
                color: '#6b7280',
                margin: '10px 0 0 0',
              }}
            >
              Manage your notification preferences at{' '}
              <Link
                href="https://manage-studio.app/preferences"
                style={{ color: primaryColor }}
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
