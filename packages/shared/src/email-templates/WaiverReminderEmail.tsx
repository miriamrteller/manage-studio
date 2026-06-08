import React from 'react';
import { Button, Text } from '@react-email/components';
import BaseEmailTemplate, { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';

interface WaiverReminderEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  language: 'en' | 'he';
  colors?: EmailColorConfig;
  footerStrings?: EmailFooterStrings;
  strings?: {
    subject?: string;
    subject_urgent?: string;
    preview?: string;
    greeting?: string;
    body?: string;
    body_urgent?: string;
    waiver_warning?: string;
    cta?: string;
    link_expires?: string;
    deadline_note?: string;
    cancellation_warning?: string;
  };
  recipientName: string;
  className: string;
  /** URL for signing the waiver — a freshly generated magic link */
  signUrl: string;
  /** ISO string of the waiver deadline */
  deadlineDate: string;
  /** true = 48h reminder (most urgent); false = 5-day reminder (first notice) */
  isUrgent: boolean;
}

const DEFAULT_STRINGS = {
  subject: 'Reminder: sign your waiver for {className}',
  subject_urgent: 'URGENT: Final reminder — sign your waiver for {className}',
  preview: 'Action needed: your enrollment in {className} is not yet active',
  greeting: 'Hi {recipientName},',
  body: 'This is a reminder that your enrollment in {className} will not be active until you sign the waiver.',
  body_urgent: 'This is your FINAL reminder. Your enrollment in {className} will be cancelled if the waiver is not signed within 48 hours.',
  waiver_warning:
    'Your spot is reserved but your enrollment is NOT active. You will not be permitted to attend class until the waiver is signed. Classes missed while your waiver is pending are not eligible for refund, credit, or makeup.',
  cta: 'Sign Your Waiver Now',
  link_expires: 'This link expires in 1 hour. If it has expired, click the link and enter your email to receive a new one.',
  deadline_note: 'Your deadline is {deadlineDate}.',
  cancellation_warning: 'If the waiver is not signed by this date, your enrollment will be automatically cancelled and a full refund will be issued.',
};

export default function WaiverReminderEmail({
  schoolName,
  schoolLogoUrl,
  language,
  colors,
  footerStrings,
  strings,
  recipientName,
  className,
  signUrl,
  deadlineDate,
  isUrgent,
}: WaiverReminderEmailProps) {
  const s = { ...DEFAULT_STRINGS, ...strings };

  const greeting = s.greeting.replace('{recipientName}', recipientName);
  const bodyText = (isUrgent ? s.body_urgent : s.body).replace('{className}', className);

  const formattedDeadline = new Date(deadlineDate).toLocaleDateString(
    language === 'he' ? 'he-IL' : 'en-GB',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
  );

  const borderColor = isUrgent ? '#dc2626' : '#f59e0b';
  const bgColor = isUrgent ? '#fef2f2' : '#fef3c7';
  const headingColor = isUrgent ? '#991b1b' : '#92400e';
  const textColor = isUrgent ? '#7f1d1d' : '#78350f';

  return (
    <BaseEmailTemplate
      previewText={s.preview.replace('{className}', className)}
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      language={language}
      colors={colors}
      footerStrings={footerStrings}
    >
      <Text style={{ fontSize: '16px', marginBottom: '10px' }}>{greeting}</Text>
      <Text style={{ fontSize: '16px', marginBottom: '20px', lineHeight: '1.6' }}>
        {bodyText}
      </Text>

      <div
        style={{
          backgroundColor: bgColor,
          border: `2px solid ${borderColor}`,
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '24px',
        }}
      >
        <Text
          style={{
            fontSize: '14px',
            color: textColor,
            lineHeight: '1.6',
            margin: '0 0 16px 0',
          }}
        >
          {s.waiver_warning}
        </Text>

        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <Button
            href={signUrl}
            style={{
              backgroundColor: isUrgent ? '#dc2626' : '#b45309',
              color: '#ffffff',
              padding: '12px 28px',
              borderRadius: '6px',
              textDecoration: 'none',
              display: 'inline-block',
              fontWeight: '700',
              fontSize: '15px',
            }}
          >
            {s.cta}
          </Button>
        </div>

        <Text style={{ fontSize: '12px', color: headingColor, margin: '0 0 8px 0' }}>
          {s.link_expires}
        </Text>

        <Text style={{ fontSize: '13px', color: textColor, margin: '0 0 4px 0' }}>
          {s.deadline_note.replace('{deadlineDate}', formattedDeadline)}
        </Text>
        <Text style={{ fontSize: '13px', color: textColor, margin: 0 }}>
          {s.cancellation_warning}
        </Text>
      </div>
    </BaseEmailTemplate>
  );
}
