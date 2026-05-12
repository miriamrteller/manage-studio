import React from 'react';
import {
  Button,
  Text,
} from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';

interface ClassCancellationEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  recipientName: string;
  cancelledClassName: string;
  cancelledDate: string;
  cancellationReason?: string;
  makeupCreditAmount?: string;
  rebookUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  bgColor?: string;
  direction?: 'ltr' | 'rtl';
}

/**
 * Class Cancellation Email Template
 * Sent when a scheduled class is cancelled
 * Includes makeup credit details and rebooking link
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
  primaryColor,
  accentColor,
  textColor,
  bgColor,
  direction = 'ltr',
}: ClassCancellationEmailProps) {
  const isRTL = direction === 'rtl';

  return (
    <BaseEmailTemplate
      previewText={`${cancelledClassName} - Class Cancelled`}
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
        {isRTL ? `שלום ${recipientName},` : `Hello ${recipientName},`}
      </Text>

      <Text
        style={{
          fontSize: '16px',
          marginBottom: '20px',
          textAlign: isRTL ? 'right' : 'left',
          color: accentColor || '#ef4444',
          fontWeight: '600',
          lineHeight: '1.6',
        }}
      >
        {isRTL
          ? `הכיתה ${cancelledClassName} בתאריך ${cancelledDate} בוטלה.`
          : `The class ${cancelledClassName} scheduled for ${cancelledDate} has been cancelled.`}
      </Text>

      {cancellationReason && (
        <Text
          style={{
            fontSize: '14px',
            marginBottom: '20px',
            textAlign: isRTL ? 'right' : 'left',
            color: '#6b7280',
            fontStyle: 'italic',
          }}
        >
          <strong>{isRTL ? 'סיבה:' : 'Reason:'}</strong> {cancellationReason}
        </Text>
      )}

      <div
        style={{
          backgroundColor: '#fef3c7',
          padding: '15px',
          borderRadius: '6px',
          marginBottom: '25px',
          borderLeft: `4px solid ${accentColor || '#ef4444'}`,
          textAlign: isRTL ? 'right' : 'left',
        }}
      >
        <Text
          style={{
            fontSize: '14px',
            fontWeight: '600',
            margin: '0 0 10px 0',
            color: accentColor || '#ef4444',
          }}
        >
          {isRTL ? '💳 זיכוי אחזקה:' : '💳 Makeup Credit:'}
        </Text>
        <Text
          style={{
            fontSize: '14px',
            margin: '0',
          }}
        >
          {isRTL
            ? `הנך זכאי לאשראי של ${makeupCreditAmount || 'כל הסכום שלך'} לשימוש בחזרה ניסיון כיתה אחרת.`
            : `You are eligible for a ${makeupCreditAmount || 'full credit'} makeup session to reschedule for another class.`}
        </Text>
      </div>

      {rebookUrl && (
        <>
          <Text
            style={{
              fontSize: '14px',
              marginBottom: '20px',
              textAlign: isRTL ? 'right' : 'left',
              lineHeight: '1.6',
            }}
          >
            {isRTL
              ? 'לתזמן מחדש כיתה אחרת עם האשראי שלך, בקר בלוח ההשראות שלך:'
              : 'To reschedule another class using your makeup credit, visit your dashboard:'}
          </Text>

          <div style={{ marginBottom: '25px', textAlign: 'center' }}>
            <Button
              href={rebookUrl}
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
              {isRTL ? 'כתום מחדש' : 'Reschedule Now'}
            </Button>
          </div>
        </>
      )}

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '10px',
          textAlign: isRTL ? 'right' : 'left',
          color: '#6b7280',
          lineHeight: '1.6',
        }}
      >
        {isRTL
          ? 'אם יש לך כל שאלה או צריך עזרה בתזמון מחדש, אנא צור קשר עם צוות התמיכה שלנו.'
          : 'If you have any questions or need help rescheduling, please contact our support team.'}
      </Text>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '10px',
          textAlign: isRTL ? 'right' : 'left',
          color: '#6b7280',
        }}
      >
        {isRTL ? 'בברכה,' : 'Best regards,'}
        <br />
        {schoolName} {isRTL ? 'צוות' : 'Team'}
      </Text>
    </BaseEmailTemplate>
  );
}
