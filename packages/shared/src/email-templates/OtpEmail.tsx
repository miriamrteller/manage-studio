import React from 'react';
import {
  Button,
  Text,
} from '@react-email/components';
import BaseEmailTemplate, { type EmailColorConfig } from './BaseEmailTemplate.js';

interface OtpEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  otpCode: string;
  expiresInMinutes?: number;
  recipientName?: string;
  direction?: 'ltr' | 'rtl';
  
  /**
   * Email color configuration
   * Passed from edge function based on tenant config
   */
  colors?: EmailColorConfig;
  
  /**
   * Template strings (from i18n + tenant overrides)
   * Schema matches packages/shared/src/i18n/email-templates-*.json
   */
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
  
  /**
   * Usage context (determines which message and label to show)
   */
  usageContext?: 'whatsapp_verification' | 'email_verification' | 'security_reset';
  
  /**
   * Legacy color props (for backward compatibility)
   * Deprecated: Use colors object instead
   */
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  bgColor?: string;
}

/**
 * Default strings (fallback when i18n/overrides not provided)
 * Matches structure in email-templates-en.json
 */
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

/**
 * OTP Email Template
 * Sent when user needs to verify email/WhatsApp or reset account
 * Expires in 10 minutes by default
 * 6-digit code + fallback plain-text display
 * 
 * Adheres to:
 * - SPEC.md 1.9.1: No hard-coded UI strings (uses i18n)
 * - .instructions.md: All colors via config object
 */
export default function OtpEmail({
  schoolName,
  schoolLogoUrl,
  otpCode,
  expiresInMinutes = 10,
  recipientName,
  direction = 'ltr',
  colors,
  strings,
  usageContext = 'email_verification',
  primaryColor,
  accentColor,
  textColor,
  bgColor,
}: OtpEmailProps) {
  const isRTL = direction === 'rtl';

  // Merge provided strings with defaults
  const finalStrings = { ...DEFAULT_STRINGS, ...strings };

  // Resolve colors (prefer colors object, fall back to individual props)
  const displayColors = colors || {
    primary: primaryColor || '#2563eb',
    accent: accentColor || '#dc2626',
    text: textColor || '#1f2937',
    bg: bgColor || '#ffffff',
    neutral: '#6b7280',
  };

  // Get context-specific message and label
  const contextMessage =
    finalStrings.context_messages?.[usageContext] ||
    finalStrings.context_messages?.['email_verification'] ||
    '';
  const contextLabel =
    finalStrings.context_labels?.[usageContext] ||
    finalStrings.context_labels?.['email_verification'] ||
    '';

  // Interpolate dynamic values
  const message = contextMessage
    .replace('{schoolName}', schoolName)
    .replace('{recipientName}', recipientName || '');

  const greeting = recipientName
    ? (finalStrings.greeting_with_name || '').replace('{recipientName}', recipientName)
    : (finalStrings.greeting_hello || '');

  const expirationText = (finalStrings.expiration_warning || '').replace(
    '{expiresInMinutes}',
    String(expiresInMinutes)
  );

  return (
    <BaseEmailTemplate
      previewText={finalStrings.preview || DEFAULT_STRINGS.preview}
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      colors={displayColors}
      direction={direction}
    >
      <Text
        style={{
          fontSize: '16px',
          marginBottom: '20px',
          textAlign: isRTL ? 'right' : 'left',
        }}
      >
        {greeting}
      </Text>

      <Text
        style={{
          fontSize: '16px',
          marginBottom: '30px',
          textAlign: isRTL ? 'right' : 'left',
          lineHeight: '1.6',
        }}
      >
        {message}
      </Text>

      {/* Large OTP code display - accessibility: visible both as large text and with copyable format */}
      <div
        style={{
          backgroundColor: displayColors.primary,
          color: '#ffffff',
          padding: '30px',
          borderRadius: '8px',
          textAlign: 'center',
          marginBottom: '30px',
        }}
      >
        <Text
          style={{
            fontSize: '12px',
            margin: '0 0 15px 0',
            opacity: '0.9',
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          {contextLabel}
        </Text>
        <div
          style={{
            fontSize: '48px',
            fontWeight: 'bold',
            letterSpacing: '8px',
            fontFamily: '"Courier New", monospace',
            margin: '10px 0',
            wordBreak: 'break-all',
          }}
        >
          {otpCode.split('').join(' ')}
        </div>
      </div>

      {/* Fallback: copy-pasteable code */}
      <div
        style={{
          backgroundColor: '#f3f4f6',
          padding: '15px',
          borderRadius: '4px',
          marginBottom: '25px',
          textAlign: 'center',
          fontFamily: '"Courier New", monospace',
          fontSize: '18px',
          fontWeight: 'bold',
        }}
      >
        {otpCode}
      </div>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '20px',
          textAlign: 'center',
          color: displayColors.accent,
        }}
      >
        ⏰ {expirationText}
      </Text>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '20px',
          textAlign: isRTL ? 'right' : 'left',
          color: displayColors.neutral,
          lineHeight: '1.6',
        }}
      >
        {finalStrings.security_notice}
      </Text>
    </BaseEmailTemplate>
  );
}
