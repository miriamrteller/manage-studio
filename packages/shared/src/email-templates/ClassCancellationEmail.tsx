import React from 'react';
import {
  Button,
  Text,
} from '@react-email/components';
import BaseEmailTemplate, { type EmailColorConfig } from './BaseEmailTemplate.js';

interface ClassCancellationEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  recipientName: string;
  cancelledClassName: string;
  cancelledDate: string;
  cancellationReason?: string;
  makeupCreditAmount?: string;
  rebookUrl?: string;
  
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
    greeting?: string;
    announcement?: string;
    cancellation_reason_label?: string;
    makeup_credit_heading?: string;
    makeup_credit_text?: string;
    reschedule_instructions?: string;
    cta_button?: string;
    support_text?: string;
  };
}

/**
 * Default strings (fallback when i18n/overrides not provided)
 * Matches structure in email-templates-en.json
 */
const DEFAULT_STRINGS = {
  preview: 'Class Cancellation Notice',
  greeting: 'Hello {recipientName},',
  announcement: 'The class {cancelledClassName} scheduled for {cancelledDate} has been cancelled.',
  cancellation_reason_label: 'Reason:',
  makeup_credit_heading: '💳 Makeup Credit:',
  makeup_credit_text: 'You are eligible for a {makeupCreditAmount} makeup session to reschedule for another class.',
  reschedule_instructions: 'To reschedule another class using your makeup credit, visit your dashboard:',
  cta_button: 'Reschedule Now',
  support_text: 'If you have any questions or need help rescheduling, please contact our support team.',
};

/**
 * Class Cancellation Email Template
 * Sent when a scheduled class is cancelled
 * Includes makeup credit details and rebooking link
 * 
 * Adheres to:
 * - SPEC.md 2.1: Direction computed from language in BaseEmailTemplate only
 * - No hardcoded text (uses i18n)
 * - All colors via CSS variables
 */
export default function ClassCancellationEmail({
  schoolName,
  schoolLogoUrl,
  recipientName,
  cancelledClassName,
  cancelledDate,
  cancellationReason,
  makeupCreditAmount,
  rebookUrl,
  language,
  colors,
  strings,
}: ClassCancellationEmailProps) {
  // Merge provided strings with defaults
  const finalStrings = { ...DEFAULT_STRINGS, ...strings };

  // Interpolate dynamic values
  const greeting = (finalStrings.greeting || '').replace('{recipientName}', recipientName);

  const announcement = (finalStrings.announcement || '')
    .replace('{cancelledClassName}', cancelledClassName)
    .replace('{cancelledDate}', cancelledDate);

  const previewText = (finalStrings.preview || '');

  const makeupCreditText = (finalStrings.makeup_credit_text || '')
    .replace('{makeupCreditAmount}', makeupCreditAmount || 'full credit');

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
          marginBottom: '10px',
        }}
      >
        {greeting}
      </Text>

      <Text
        style={{
          fontSize: '16px',
          marginBottom: '20px',
          color: 'var(--email-accent)',
          fontWeight: '600',
          lineHeight: '1.6',
        }}
      >
        {announcement}
      </Text>

      {cancellationReason && (
        <Text
          style={{
            fontSize: '14px',
            marginBottom: '20px',
            color: 'var(--email-neutral)',
            fontStyle: 'italic',
          }}
        >
          <strong>{finalStrings.cancellation_reason_label || DEFAULT_STRINGS.cancellation_reason_label}</strong> {cancellationReason}
        </Text>
      )}

      <div
        style={{
          backgroundColor: '#fef3c7',
          padding: '15px',
          borderRadius: '6px',
          marginBottom: '25px',
          borderLeft: '4px solid var(--email-accent)',
        }}
      >
        <Text
          style={{
            fontSize: '14px',
            fontWeight: '600',
            margin: '0 0 10px 0',
            color: 'var(--email-accent)',
          }}
        >
          {finalStrings.makeup_credit_heading || DEFAULT_STRINGS.makeup_credit_heading}
        </Text>
        <Text
          style={{
            fontSize: '14px',
            margin: '0',
          }}
        >
          {makeupCreditText}
        </Text>
      </div>

      {rebookUrl && (
        <>
          <Text
            style={{
              fontSize: '14px',
              marginBottom: '20px',
              lineHeight: '1.6',
            }}
          >
            {finalStrings.reschedule_instructions || DEFAULT_STRINGS.reschedule_instructions}
          </Text>

          <div style={{ marginBottom: '25px', textAlign: 'center' }}>
            <Button
              href={rebookUrl}
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
        </>
      )}

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '10px',
          color: 'var(--email-neutral)',
          lineHeight: '1.6',
        }}
      >
        {finalStrings.support_text || DEFAULT_STRINGS.support_text}
      </Text>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '10px',
          color: 'var(--email-neutral)',
        }}
      >
        Best regards,
        <br />
        {schoolName} Team
      </Text>
    </BaseEmailTemplate>
  );
}
