import React from 'react';
import { Text } from '@react-email/components';
import BaseEmailTemplate, { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
import { EmailPrimaryButton } from './primitives/index.js';

interface EnrolmentAgeReviewApprovedEmailProps {
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
    cta_button?: string;
    footer_note?: string;
  };
  recipientName: string;
  studentName: string;
  className: string;
  payUrl: string;
}

const DEFAULT_STRINGS = {
  subject: 'Enrolment approved — {className}',
  preview: 'Your age review request was approved',
  greeting: 'Hi {recipientName},',
  body: 'Good news! {schoolName} has approved {studentName} for {className}. You can complete payment using the link below.',
  cta_button: 'Complete payment',
  footer_note: 'If you have questions, please contact the studio.',
};

export default function EnrolmentAgeReviewApprovedEmail({
  schoolName,
  schoolLogoUrl,
  language,
  colors,
  footerStrings,
  strings,
  recipientName,
  studentName,
  className,
  payUrl,
}: EnrolmentAgeReviewApprovedEmailProps) {
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
      <Text style={{ fontSize: '16px', marginBottom: '24px', lineHeight: '1.6' }}>{body}</Text>
      <EmailPrimaryButton href={payUrl}>
        {s.cta_button}
      </EmailPrimaryButton>
      <Text style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.6' }}>{s.footer_note}</Text>
    </BaseEmailTemplate>
  );
}
