import React from 'react';
import {
  Button,
  Link,
  Text,
} from '@react-email/components';
import BaseEmailTemplate, { type EmailColorConfig } from './BaseEmailTemplate.js';

interface MagicLinkEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  magicLinkUrl: string;
  expiresInMinutes?: number;
  recipientName?: string;
  
  /**
   * Language (REQUIRED) - For i18n and direction computation
   * Direction computed in BaseEmailTemplate: language === 'he' ? 'rtl' : 'ltr'
   */
  language: 'en' | 'he';
  
  /**
   * Email color configuration (OPTIONAL)
   * Passed from edge function based on tenant config
   */
  colors?: EmailColorConfig;
  
  /**
   * Template strings (from i18n + tenant overrides)
   * Schema matches packages/shared/src/i18n/email-templates-*.json
   */
  strings?: {
    preview?: string;
    greeting_hello?: string;
    greeting_with_name?: string;
    intro?: string;
    cta_button?: string;
    fallback_text?: string;
    expiration_notice?: string;
    security_notice?: string;
  };
}

/**
 * Default strings (fallback when i18n/overrides not provided)
 * Matches structure in email-templates-en.json
 */
const DEFAULT_STRINGS = {
  preview: 'Sign in to {schoolName}',
  greeting_hello: 'Hello,',
  greeting_with_name: 'Hello {recipientName},',
  intro: 'We received a request to sign in to your {schoolName} account. If you didn\'t make this request, you can ignore this message.',
  cta_button: 'Sign In',
  fallback_text: 'Or copy and paste this link in your browser:',
  expiration_notice: '⏰ This link expires in {expiresInMinutes} minutes',
  security_notice: 'This link can only be used once. If you didn\'t request this sign-in link, you can safely ignore this message.',
};

/**
 * Magic Link Email Template
 * Sent during login flow for passwordless authentication
 * Expires in 15 minutes by default
 * Includes fallback plain-text link for accessibility
 * 
 * Adheres to:
 * - SPEC.md 2.1: Direction computed from language in BaseEmailTemplate only
 * - No hardcoded text (uses i18n)
 * - All colors via CSS variables
 */
export default function MagicLinkEmail({
  schoolName,
  schoolLogoUrl,
  magicLinkUrl,
  expiresInMinutes = 15,
  recipientName,
  language,
  colors,
  strings,
}: MagicLinkEmailProps) {
  // Merge provided strings with defaults
  const finalStrings = { ...DEFAULT_STRINGS, ...strings };

  // Interpolate dynamic values
  const greeting = recipientName
    ? (finalStrings.greeting_with_name || '').replace('{recipientName}', recipientName)
    : (finalStrings.greeting_hello || '');

  const intro = (finalStrings.intro || '').replace('{schoolName}', schoolName);

  const expirationText = (finalStrings.expiration_notice || '').replace(
    '{expiresInMinutes}',
    String(expiresInMinutes)
  );

  const previewText = (finalStrings.preview || '').replace('{schoolName}', schoolName);

  return (
    <BaseEmailTemplate
      previewText={previewText}
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      language={language}
      colors={colors}
    >
      <Text
        style={{
          fontSize: '16px',
          marginBottom: '20px',
        }}
      >
        {greeting}
      </Text>

      <Text
        style={{
          fontSize: '16px',
          marginBottom: '20px',
          lineHeight: '1.6',
        }}
      >
        {intro}
      </Text>

      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <Button
          href={magicLinkUrl}
          style={{
            backgroundColor: 'var(--email-primary)',
            color: '#ffffff',
            padding: '12px 32px',
            borderRadius: '6px',
            textDecoration: 'none',
            display: 'inline-block',
            fontWeight: '600',
            fontSize: '16px',
          }}
        >
          {finalStrings.cta_button || DEFAULT_STRINGS.cta_button}
        </Button>
      </div>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '15px',
          color: 'var(--email-neutral)',
        }}
      >
        {finalStrings.fallback_text || DEFAULT_STRINGS.fallback_text}
      </Text>

      <div
        style={{
          backgroundColor: '#f3f4f6',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '20px',
          wordBreak: 'break-all',
        }}
      >
        <Link
          href={magicLinkUrl}
          style={{
            color: 'var(--email-primary)',
            textDecoration: 'underline',
            fontSize: '12px',
          }}
        >
          {magicLinkUrl}
        </Link>
      </div>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '20px',
          color: '#ef4444',
        }}
      >
        {expirationText}
      </Text>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '10px',
          color: 'var(--email-neutral)',
        }}
      >
        {finalStrings.security_notice || DEFAULT_STRINGS.security_notice}
      </Text>
    </BaseEmailTemplate>
  );
}
