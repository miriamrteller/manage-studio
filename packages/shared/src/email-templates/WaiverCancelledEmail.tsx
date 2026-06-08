import React from 'react';
import { Text } from '@react-email/components';
import BaseEmailTemplate, { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';

interface WaiverCancelledEmailProps {
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
    refund_note?: string;
    contact_note?: string;
  };
  recipientName: string;
  className: string;
  /** e.g. "A full refund has been issued to your original payment method." or "No payment was taken." */
  refundNote: string;
}

const DEFAULT_STRINGS = {
  subject: 'Your enrollment in {className} has been cancelled',
  preview: 'Enrollment cancelled — waiver not signed',
  greeting: 'Hi {recipientName},',
  body: 'Your enrollment in {className} has been automatically cancelled because the required waiver was not signed before the deadline.',
  refund_note: '{refundNote}',
  contact_note: 'If you believe this is an error, or if you would like to re-enroll, please contact us.',
};

export default function WaiverCancelledEmail({
  schoolName,
  schoolLogoUrl,
  language,
  colors,
  footerStrings,
  strings,
  recipientName,
  className,
  refundNote,
}: WaiverCancelledEmailProps) {
  const s = { ...DEFAULT_STRINGS, ...strings };

  return (
    <BaseEmailTemplate
      previewText={s.preview}
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      language={language}
      colors={colors}
      footerStrings={footerStrings}
    >
      <Text style={{ fontSize: '16px', marginBottom: '10px' }}>
        {s.greeting.replace('{recipientName}', recipientName)}
      </Text>

      <Text style={{ fontSize: '16px', marginBottom: '20px', lineHeight: '1.6' }}>
        {s.body.replace('{className}', className)}
      </Text>

      <div
        style={{
          backgroundColor: '#fee2e2',
          border: '2px solid #dc2626',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px',
        }}
      >
        <Text style={{ fontSize: '14px', color: '#7f1d1d', margin: 0 }}>
          {s.refund_note.replace('{refundNote}', refundNote)}
        </Text>
      </div>

      <Text style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.6' }}>
        {s.contact_note}
      </Text>
    </BaseEmailTemplate>
  );
}
