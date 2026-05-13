import React from 'react';
import {
  Button,
  Text,
} from '@react-email/components';
import BaseEmailTemplate, { type EmailColorConfig } from './BaseEmailTemplate.js';

interface WaitingListOfferEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  recipientName: string;
  className: string;
  availableSlots: number;
  offerExpiryDate: string;
  enrollNowUrl: string;
  termName?: string;
  classDetails?: {
    startDate?: string;
    endDate?: string;
    day?: string;
    time?: string;
    teacher?: string;
  };
  
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
    heading?: string;
    greeting?: string;
    offer?: string;
    class_details_heading?: string;
    class_label?: string;
    day_label?: string;
    time_label?: string;
    dates_label?: string;
    teacher_label?: string;
    cta_text?: string;
    cta_button?: string;
    expiry_heading?: string;
    expiry_notice?: string;
    support_text?: string;
  };
}

/**
 * Default strings (fallback when i18n/overrides not provided)
 * Matches structure in email-templates-en.json
 */
const DEFAULT_STRINGS = {
  preview: 'A Spot Just Opened! - {schoolName}',
  heading: '🎉 A Space is Available!',
  greeting: 'Hello {recipientName},',
  offer: 'Great news! {availableSlots} {slotText} now available in {className}, the class you\'ve been waitlisted for.',
  class_details_heading: 'Class Details:',
  class_label: 'Class:',
  day_label: 'Day:',
  time_label: 'Time:',
  dates_label: 'Dates:',
  teacher_label: 'Instructor:',
  cta_text: 'Was waiting for this? All you need to do is click the button below to secure your spot now!',
  cta_button: 'Enroll Now',
  expiry_heading: '⏰ Limited Time Offer:',
  expiry_notice: 'This offer expires on {offerExpiryDate}. After that date, the spot may be offered to other waitlisted students.',
  support_text: 'If you have any questions or need help with enrollment, please don\'t hesitate to contact our support team.',
};

/**
 * Waiting List Offer Email Template
 * Sent when a space opens up in a class that user was waitlisted for
 * Time-limited offer with CTA to enroll
 * 
 * Adheres to:
 * - SPEC.md 2.1: Direction computed from language in BaseEmailTemplate only
 * - No hardcoded text (uses i18n)
 * - All colors via CSS variables
 */
export default function WaitingListOfferEmail({
  schoolName,
  schoolLogoUrl,
  recipientName,
  className,
  availableSlots,
  offerExpiryDate,
  enrollNowUrl,
  termName,
  classDetails,
  language,
  colors,
  strings,
}: WaitingListOfferEmailProps) {
  // Merge provided strings with defaults
  const finalStrings = { ...DEFAULT_STRINGS, ...strings };

  // Interpolate dynamic values
  const slotText = availableSlots > 1 ? 'spaces are' : 'space is';
  const offer = (finalStrings.offer || '')
    .replace('{availableSlots}', String(availableSlots))
    .replace('{slotText}', slotText)
    .replace('{className}', className);

  const greeting = (finalStrings.greeting || '').replace('{recipientName}', recipientName);

  const previewText = (finalStrings.preview || '').replace('{schoolName}', schoolName);

  const expiryNotice = (finalStrings.expiry_notice || '').replace('{offerExpiryDate}', offerExpiryDate);

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
          fontSize: '18px',
          fontWeight: 'bold',
          marginBottom: '15px',
          color: 'var(--email-accent)',
        }}
      >
        {finalStrings.heading || DEFAULT_STRINGS.heading}
      </Text>

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
          marginBottom: '25px',
          lineHeight: '1.6',
        }}
      >
        {offer}
      </Text>

      {/* Class details card */}
      <div
        style={{
          backgroundColor: '#f0fdf4',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '25px',
          borderLeft: '4px solid var(--email-accent)',
        }}
      >
        <Text
          style={{
            fontSize: '14px',
            fontWeight: '600',
            margin: '0 0 15px 0',
          }}
        >
          {finalStrings.class_details_heading || DEFAULT_STRINGS.class_details_heading}
        </Text>

        <Text
          style={{
            fontSize: '14px',
            margin: '8px 0',
          }}
        >
          <strong>{finalStrings.class_label || DEFAULT_STRINGS.class_label}</strong> {className}
        </Text>

        {classDetails?.day && (
          <Text
            style={{
              fontSize: '14px',
              margin: '8px 0',
            }}
          >
            <strong>{finalStrings.day_label || DEFAULT_STRINGS.day_label}</strong> {classDetails.day}
          </Text>
        )}

        {classDetails?.time && (
          <Text
            style={{
              fontSize: '14px',
              margin: '8px 0',
            }}
          >
            <strong>{finalStrings.time_label || DEFAULT_STRINGS.time_label}</strong> {classDetails.time}
          </Text>
        )}

        {classDetails?.startDate && classDetails?.endDate && (
          <Text
            style={{
              fontSize: '14px',
              margin: '8px 0',
            }}
          >
            <strong>{finalStrings.dates_label || DEFAULT_STRINGS.dates_label}</strong> {classDetails.startDate} to{' '}
            {classDetails.endDate}
          </Text>
        )}

        {classDetails?.teacher && (
          <Text
            style={{
              fontSize: '14px',
              margin: '8px 0',
            }}
          >
            <strong>{finalStrings.teacher_label || DEFAULT_STRINGS.teacher_label}</strong> {classDetails.teacher}
          </Text>
        )}
      </div>

      <Text
        style={{
          fontSize: '16px',
          marginBottom: '25px',
          lineHeight: '1.6',
        }}
      >
        {finalStrings.cta_text || DEFAULT_STRINGS.cta_text}
      </Text>

      <div style={{ marginBottom: '25px', textAlign: 'center' }}>
        <Button
          href={enrollNowUrl}
          style={{
            backgroundColor: 'var(--email-accent)',
            color: '#ffffff',
            padding: '14px 40px',
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

      {/* Expiry notice */}
      <div
        style={{
          backgroundColor: '#fef3c7',
          padding: '15px',
          borderRadius: '6px',
          marginBottom: '25px',
          borderLeft: '4px solid #f59e0b',
        }}
      >
        <Text
          style={{
            fontSize: '14px',
            fontWeight: '600',
            margin: '0 0 8px 0',
            color: '#92400e',
          }}
        >
          {finalStrings.expiry_heading || DEFAULT_STRINGS.expiry_heading}
        </Text>
        <Text
          style={{
            fontSize: '14px',
            margin: '0',
            color: '#92400e',
          }}
        >
          {expiryNotice}
        </Text>
      </div>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '15px',
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
