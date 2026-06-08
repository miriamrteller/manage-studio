import React from 'react';
import { Button, Text } from '@react-email/components';
import BaseEmailTemplate, { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';

interface EnrolmentConfirmationEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  language: 'en' | 'he';
  colors?: EmailColorConfig;
  footerStrings?: EmailFooterStrings;
  strings?: {
    subject?: string;
    preview?: string;
    greeting?: string;
    enrollment_confirmed?: string;
    enrollment_reserved?: string;
    waiver_warning_heading?: string;
    waiver_warning_body?: string;
    waiver_cta?: string;
    link_expires?: string;
    no_show_policy?: string;
    confirmation_note?: string;
  };
  /** Student name */
  recipientName: string;
  /** Class name */
  className: string;
  /** If true, shows the pending waiver warning and sign CTA */
  pendingWaiver: boolean;
  /** Magic link URL for signing the waiver (required when pendingWaiver=true) */
  signUrl?: string;
  /** ISO datetime string of the waiver deadline */
  deadlineDate?: string;
}

const DEFAULT_STRINGS = {
  subject: 'Your enrollment at {schoolName}',
  preview: 'Enrollment confirmation for {className}',
  greeting: 'Hi {recipientName},',
  enrollment_confirmed: 'Your enrollment in {className} is confirmed!',
  enrollment_reserved: 'Your spot in {className} is reserved.',
  waiver_warning_heading: 'ACTION REQUIRED: Sign your waiver',
  waiver_warning_body:
    'Your spot is reserved but your enrollment is NOT active. You will not be permitted to attend class until the waiver is signed. Classes missed while your waiver is pending are not eligible for refund, credit, or makeup.',
  waiver_cta: 'Sign Your Waiver Now',
  link_expires: 'This link expires in 1 hour. If it has expired, visit the link in this email and enter your email address to receive a new one.',
  no_show_policy: 'Deadline: {deadlineDate}. If the waiver is not signed by this date, your enrollment will be automatically cancelled and a full refund issued.',
  confirmation_note: 'Please contact us if you have any questions.',
};

export default function EnrolmentConfirmationEmail({
  schoolName,
  schoolLogoUrl,
  language,
  colors,
  footerStrings,
  strings,
  recipientName,
  className,
  pendingWaiver,
  signUrl,
  deadlineDate,
}: EnrolmentConfirmationEmailProps) {
  const s = { ...DEFAULT_STRINGS, ...strings };

  const greeting = s.greeting.replace('{recipientName}', recipientName);
  const preview = s.preview.replace('{className}', className);
  const mainText = pendingWaiver
    ? s.enrollment_reserved.replace('{className}', className)
    : s.enrollment_confirmed.replace('{className}', className);

  const formattedDeadline = deadlineDate
    ? new Date(deadlineDate).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  return (
    <BaseEmailTemplate
      previewText={preview}
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      language={language}
      colors={colors}
      footerStrings={footerStrings}
    >
      <Text style={{ fontSize: '16px', marginBottom: '10px' }}>{greeting}</Text>
      <Text style={{ fontSize: '16px', marginBottom: '20px', lineHeight: '1.6' }}>
        {mainText}
      </Text>

      {pendingWaiver && (
        <div
          style={{
            backgroundColor: '#fef3c7',
            border: '2px solid #f59e0b',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <Text
            style={{
              fontSize: '15px',
              fontWeight: '700',
              color: '#92400e',
              margin: '0 0 10px 0',
            }}
          >
            {s.waiver_warning_heading}
          </Text>
          <Text
            style={{
              fontSize: '14px',
              color: '#78350f',
              lineHeight: '1.6',
              margin: '0 0 16px 0',
            }}
          >
            {s.waiver_warning_body}
          </Text>

          {signUrl && (
            <>
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <Button
                  href={signUrl}
                  style={{
                    backgroundColor: '#b45309',
                    color: '#ffffff',
                    padding: '12px 28px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    display: 'inline-block',
                    fontWeight: '700',
                    fontSize: '15px',
                  }}
                >
                  {s.waiver_cta}
                </Button>
              </div>
              <Text style={{ fontSize: '12px', color: '#92400e', margin: '0 0 8px 0' }}>
                {s.link_expires}
              </Text>
            </>
          )}

          {formattedDeadline && (
            <Text style={{ fontSize: '13px', color: '#78350f', margin: 0 }}>
              {s.no_show_policy.replace('{deadlineDate}', formattedDeadline)}
            </Text>
          )}
        </div>
      )}

      <Text
        style={{
          fontSize: '14px',
          color: '#6b7280',
          lineHeight: '1.6',
          marginBottom: '10px',
        }}
      >
        {s.confirmation_note}
      </Text>
    </BaseEmailTemplate>
  );
}
