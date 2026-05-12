import React from 'react';
import {
  Button,
  Text,
} from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';

interface WelcomeEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  recipientName: string;
  enrolledClassName: string;
  enrolledTermName: string;
  dashboardUrl: string;
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  bgColor?: string;
  direction?: 'ltr' | 'rtl';
}

/**
 * Welcome Email Template
 * Sent after successful enrolment to confirm participation
 * Includes link to dashboard/schedule view
 */
export default function WelcomeEmail({
  schoolName,
  schoolLogoUrl,
  recipientName,
  enrolledClassName,
  enrolledTermName,
  dashboardUrl,
  primaryColor,
  accentColor,
  textColor,
  bgColor,
  direction = 'ltr',
}: WelcomeEmailProps) {
  const isRTL = direction === 'rtl';

  return (
    <BaseEmailTemplate
      previewText={`Welcome to ${enrolledClassName} - ${schoolName}`}
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      primaryColor={primaryColor}
      accentColor={accentColor}
      textColor={textColor}
      bgColor={bgColor}
      direction={direction}
    >
      <Text
        style={{
          fontSize: '16px',
          marginBottom: '10px',
          textAlign: isRTL ? 'right' : 'left',
        }}
      >
        {isRTL ? `ברוכים הבאים, ${recipientName}!` : `Welcome, ${recipientName}!`}
      </Text>

      <Text
        style={{
          fontSize: '16px',
          marginBottom: '25px',
          textAlign: isRTL ? 'right' : 'left',
          lineHeight: '1.6',
        }}
      >
        {isRTL
          ? `הרשמתך ל${enrolledClassName} בתקופת ${enrolledTermName} אושרה בהצלחה!`
          : `Your enrollment in ${enrolledClassName} for ${enrolledTermName} has been successfully confirmed!`}
      </Text>

      <div
        style={{
          backgroundColor: '#f0f9ff',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '25px',
          borderLeft: `4px solid ${primaryColor || '#2563eb'}`,
          textAlign: isRTL ? 'right' : 'left',
        }}
      >
        <Text
          style={{
            fontSize: '14px',
            fontWeight: '600',
            margin: '0 0 10px 0',
          }}
        >
          {isRTL ? 'פרטי הכיתה:' : 'Class Details:'}
        </Text>
        <Text
          style={{
            fontSize: '14px',
            margin: '5px 0',
          }}
        >
          <strong>{isRTL ? 'כיתה:' : 'Class:'}</strong> {enrolledClassName}
        </Text>
        <Text
          style={{
            fontSize: '14px',
            margin: '5px 0',
          }}
        >
          <strong>{isRTL ? 'תקופה:' : 'Term:'}</strong> {enrolledTermName}
        </Text>
      </div>

      <Text
        style={{
          fontSize: '16px',
          marginBottom: '20px',
          textAlign: isRTL ? 'right' : 'left',
          lineHeight: '1.6',
        }}
      >
        {isRTL
          ? 'לצפייה בלוח הזמנים המלא, סימני דרך וברכות לכיתה, בקר בלוח ההשראות שלך:'
          : 'To view the full schedule, milestones, and class announcements, visit your dashboard:'}
      </Text>

      <div style={{ marginBottom: '25px', textAlign: 'center' }}>
        <Button
          href={dashboardUrl}
          style={{
            backgroundColor: primaryColor || '#2563eb',
            color: '#ffffff',
            padding: '12px 32px',
            borderRadius: '6px',
            textDecoration: 'none',
            display: 'inline-block',
            fontWeight: '600',
            fontSize: '16px',
          }}
        >
          {isRTL ? 'בקר בלוח הבקרה' : 'Visit Dashboard'}
        </Button>
      </div>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '15px',
          textAlign: isRTL ? 'right' : 'left',
          color: '#6b7280',
          lineHeight: '1.6',
        }}
      >
        {isRTL
          ? 'אם יש לך שאלות לגבי הכיתה או תקופה זו, בואו נדבר! צוות התמיכה שלנו פה כדי לעזור.'
          : 'If you have any questions about this class or term, we\'re here to help! Our support team is ready to assist.'}
      </Text>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '10px',
          textAlign: isRTL ? 'right' : 'left',
          color: '#6b7280',
        }}
      >
        {isRTL ? 'בברכה,' : 'Warm regards,'}
        <br />
        {schoolName} {isRTL ? 'צוות' : 'Team'}
      </Text>
    </BaseEmailTemplate>
  );
}
