import React from 'react';
import BaseEmailTemplate, { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
import {
  EmailCodeBox,
  EmailMutedText,
  EmailParagraph,
  EmailWarningText,
} from './primitives/index.js';

interface OtpEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  otpCode: string;
  expiresInMinutes?: number;
  recipientName?: string;
  language: 'en' | 'he';
  colors?: EmailColorConfig;
  footerStrings?: EmailFooterStrings;
  strings?: {
    preview?: string;
    heading?: string;
    greeting_hello?: string;
    greeting_with_name?: string;
    context_messages?: Record<string, string>;
    context_labels?: Record<string, string>;
    expiration_warning?: string;
    security_notice?: string;
  };
  usageContext?: 'whatsapp_verification' | 'email_verification' | 'security_reset';
}

const DEFAULT_STRINGS = {
  preview: 'Your Verification Code',
  heading: 'Your Verification Code',
  greeting_hello: 'Hello,',
  greeting_with_name: 'Hello {recipientName},',
  context_messages: {
    whatsapp_verification: 'To verify your WhatsApp number with {schoolName}, use this code:',
    email_verification: 'To verify your email address with {schoolName}, use this code:',
    security_reset: 'To reset your password with {schoolName}, use this code:',
  },
  context_labels: {
    whatsapp_verification: 'WhatsApp Verification',
    email_verification: 'Email Verification',
    security_reset: 'Password Reset',
  },
  expiration_warning: 'This code expires in {expiresInMinutes} minutes',
  security_notice:
    "If you didn't request this code, please ignore this message. If you believe your account has been compromised, please contact our support team immediately.",
};

export default function OtpEmail({
  schoolName,
  schoolLogoUrl,
  otpCode,
  expiresInMinutes = 10,
  recipientName,
  language,
  colors,
  footerStrings,
  strings,
  usageContext = 'email_verification',
}: OtpEmailProps) {
  const finalStrings = { ...DEFAULT_STRINGS, ...strings };

  const contextMessage =
    finalStrings.context_messages?.[usageContext] ||
    finalStrings.context_messages?.['email_verification'] ||
    '';
  const contextLabel =
    finalStrings.context_labels?.[usageContext] ||
    finalStrings.context_labels?.['email_verification'] ||
    '';

  const message = contextMessage.replace('{schoolName}', schoolName);

  const greeting = recipientName
    ? (finalStrings.greeting_with_name || '').replace('{recipientName}', recipientName)
    : (finalStrings.greeting_hello || '');

  const expirationText = (finalStrings.expiration_warning || '').replace(
    '{expiresInMinutes}',
    String(expiresInMinutes),
  );

  return (
    <BaseEmailTemplate
      previewText={finalStrings.preview || DEFAULT_STRINGS.preview}
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      language={language}
      colors={colors}
      footerStrings={footerStrings}
    >
      <EmailParagraph>{greeting}</EmailParagraph>
      <EmailParagraph>{message}</EmailParagraph>
      <EmailCodeBox code={otpCode} label={contextLabel} />
      <EmailWarningText style={{ textAlign: 'center' }}>
        {expirationText}
      </EmailWarningText>
      <EmailMutedText>{finalStrings.security_notice}</EmailMutedText>
    </BaseEmailTemplate>
  );
}
