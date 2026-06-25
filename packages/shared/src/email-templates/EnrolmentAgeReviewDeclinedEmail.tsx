import React from 'react';
import { Text } from '@react-email/components';
import BaseEmailTemplate, { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';

interface EnrolmentAgeReviewDeclinedEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  language: 'en' | 'he';
  colors?: EmailColorConfig;
  footerStrings?: EmailFooterStrings;
  strings?: {
    subject?: string;
    preview?: string;
    greeting?: string;
    body?: string;
    reason_label?: string;
    footer_note?: string;
  };
  recipientName: string;
  studentName: string;
  className: string;
  declineReason?: string;
}

const DEFAULT_STRINGS = {
  subject: 'Age review update — {className}',
  preview: 'Update on your age review request',
  greeting: 'Hi {recipientName},',
  body: 'After review, {schoolName} is unable to approve {studentName} for {className} based on the class age requirements.',
  reason_label: 'Note from the studio',
  footer_note: 'You may browse other classes or contact the studio if you have questions.',
};

export default function EnrolmentAgeReviewDeclinedEmail({
  schoolName,
  schoolLogoUrl,
  language,
  colors,
  footerStrings,
  strings,
  recipientName,
  studentName,
  className,
  declineReason,
}: EnrolmentAgeReviewDeclinedEmailProps) {
  const s = { ...DEFAULT_STRINGS, ...strings };
  const greeting = s.greeting.replace('{recipientName}', recipientName);
  const body = s.body
    .replace('{schoolName}', schoolName)
    .replace('{studentName}', studentName)
    .replace('{className}', className);

  return (
    <BaseEmailTemplate
      previewText={s.preview}
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      language={language}
      colors={colors}
      footerStrings={footerStrings}
    >
      <Text style={{ fontSize: '16px', marginBottom: '10px' }}>{greeting}</Text>
      <Text style={{ fontSize: '16px', marginBottom: '16px', lineHeight: '1.6' }}>{body}</Text>
      {declineReason && (
        <>
          <Text style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{s.reason_label}</Text>
          <Text style={{ fontSize: '14px', marginBottom: '16px', lineHeight: '1.6' }}>{declineReason}</Text>
        </>
      )}
      <Text style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.6' }}>{s.footer_note}</Text>
    </BaseEmailTemplate>
  );
}
