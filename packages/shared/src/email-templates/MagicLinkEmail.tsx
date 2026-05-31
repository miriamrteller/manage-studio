import React from 'react';
import BaseEmailTemplate, { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
import {
  EmailCodeWithCopy,
  EmailLinkBox,
  EmailMutedText,
  EmailParagraph,
  EmailPrimaryButton,
  EmailWarningText,
} from './primitives/index.js';

export interface MagicLinkEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  magicLinkUrl: string;
  /** 6-digit sign-in code (login Code tab) */
  otpCode?: string;
  expiresInMinutes?: number;
  recipientName?: string;
  language: 'en' | 'he';
  colors?: EmailColorConfig;
  footerStrings?: EmailFooterStrings;
  strings?: {
    preview?: string;
    subject?: string;
    greeting_hello?: string;
    greeting_with_name?: string;
    intro?: string;
    code_heading?: string;
    copy_button?: string;
    cta_button?: string;
    fallback_text?: string;
    expiration_notice?: string;
    security_notice?: string;
  };
}

const DEFAULT_STRINGS = {
  preview: 'Sign in to {schoolName}',
  greeting_hello: 'Hello,',
  greeting_with_name: 'Hello {recipientName},',
  intro:
    "We received a request to sign in to your {schoolName} account. If you didn't make this request, you can ignore this message.",
  code_heading: 'Your sign-in code:',
  copy_button: 'Copy',
  cta_button: 'Sign In',
  fallback_text:
    "If the button above doesn't work, copy and paste this link into your browser:",
  expiration_notice: 'This link expires in {expiresInMinutes} minutes',
  security_notice:
    "This link can only be used once. If you didn't request this sign-in link, you can safely ignore this message.",
};

export default function MagicLinkEmail({
  schoolName,
  schoolLogoUrl,
  magicLinkUrl,
  otpCode,
  expiresInMinutes = 15,
  recipientName,
  language,
  colors,
  footerStrings,
  strings,
}: MagicLinkEmailProps) {
  const finalStrings = { ...DEFAULT_STRINGS, ...strings };

  const greeting = recipientName
    ? (finalStrings.greeting_with_name || '').replace('{recipientName}', recipientName)
    : (finalStrings.greeting_hello || '');

  const intro = (finalStrings.intro || '').replace('{schoolName}', schoolName);

  const expirationText = (finalStrings.expiration_notice || '').replace(
    '{expiresInMinutes}',
    String(expiresInMinutes),
  );

  const previewText = (finalStrings.preview || '').replace('{schoolName}', schoolName);

  const primaryColor =
    colors?.primary?.startsWith('var(')
      ? colors.primary.replace(/var\(--email-primary,\s*([^)]+)\)/, '$1').trim()
      : colors?.primary ?? '#2563eb';

  return (
    <BaseEmailTemplate
      previewText={previewText}
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      language={language}
      colors={colors}
      footerStrings={footerStrings}
    >
      <EmailParagraph>{greeting}</EmailParagraph>
      <EmailParagraph>{intro}</EmailParagraph>

      {otpCode ? (
        <>
          <EmailParagraph style={{ fontWeight: 600 }}>
            {finalStrings.code_heading || DEFAULT_STRINGS.code_heading}
          </EmailParagraph>
          <EmailCodeWithCopy
            code={otpCode}
            copyLabel={finalStrings.copy_button || DEFAULT_STRINGS.copy_button}
            primaryColor={primaryColor}
          />
        </>
      ) : null}

      <EmailPrimaryButton href={magicLinkUrl}>
        {finalStrings.cta_button || DEFAULT_STRINGS.cta_button}
      </EmailPrimaryButton>

      <EmailMutedText>
        {finalStrings.fallback_text || DEFAULT_STRINGS.fallback_text}
      </EmailMutedText>
      <EmailLinkBox href={magicLinkUrl} />

      <EmailWarningText>{expirationText}</EmailWarningText>
      <EmailMutedText>
        {finalStrings.security_notice || DEFAULT_STRINGS.security_notice}
      </EmailMutedText>
    </BaseEmailTemplate>
  );
}
