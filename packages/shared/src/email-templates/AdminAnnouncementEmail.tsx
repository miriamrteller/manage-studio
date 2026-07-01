import React from 'react';
import { Heading, Text } from '@react-email/components';
import BaseEmailTemplate, { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';

interface AdminAnnouncementEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  language: 'en' | 'he';
  colors?: EmailColorConfig;
  footerStrings?: EmailFooterStrings;
  strings?: {
    preview?: string;
  };
  subject: string;
  body: string;
}

export default function AdminAnnouncementEmail({
  schoolName,
  schoolLogoUrl,
  language,
  colors,
  footerStrings,
  strings,
  subject,
  body,
}: AdminAnnouncementEmailProps) {
  const preview =
    strings?.preview?.replace('{schoolName}', schoolName) ??
    `Announcement from ${schoolName}`;

  return (
    <BaseEmailTemplate
      previewText={preview}
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      language={language}
      colors={colors}
      footerStrings={footerStrings}
    >
      <Heading as="h1" style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>
        {subject}
      </Heading>
      <Text style={{ fontSize: '16px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{body}</Text>
    </BaseEmailTemplate>
  );
}
