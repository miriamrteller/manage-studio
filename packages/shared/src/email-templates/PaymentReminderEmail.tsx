import React from 'react';
import {
  Button,
  Link,
  Text,
} from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';

interface PaymentReminderEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  recipientName: string;
  amountOutstandingFormatted: string;
  enrolledClassName: string;
  dueDate: string;
  paymentUrl: string;
  invoiceId?: string;
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  bgColor?: string;
  direction?: 'ltr' | 'rtl';
  daysSinceOverdue?: number;
}

/**
 * Payment Reminder Email Template
 * Dunning notice for outstanding class payments
 * Includes payment link and invoice reference
 * Escalates in tone if overdue (optional daysSinceOverdue parameter)
 */
export default function PaymentReminderEmail({
  schoolName,
  schoolLogoUrl,
  recipientName,
  amountOutstandingFormatted,
  enrolledClassName,
  dueDate,
  paymentUrl,
  invoiceId,
  primaryColor,
  accentColor,
  textColor,
  bgColor,
  direction = 'ltr',
  daysSinceOverdue,
}: PaymentReminderEmailProps) {
  const isRTL = direction === 'rtl';
  const isOverdue = daysSinceOverdue && daysSinceOverdue > 0;

  return (
    <BaseEmailTemplate
      previewText={`Payment Reminder - ${amountOutstandingFormatted} Outstanding`}
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

      {isOverdue ? (
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
            ? `חשבונך עם ${schoolName} הוא בעדכון עם ${amountOutstandingFormatted} שפדויים לעידכון הנוסף של ${daysSinceOverdue} ימים.`
            : `Your account with ${schoolName} has an outstanding balance of ${amountOutstandingFormatted} that is now ${daysSinceOverdue} days overdue.`}
        </Text>
      ) : (
        <Text
          style={{
            fontSize: '16px',
            marginBottom: '20px',
            textAlign: isRTL ? 'right' : 'left',
            lineHeight: '1.6',
          }}
        >
          {isRTL
            ? `זהו תזכורת שיש לך תשלום שלא שולם עבור ${enrolledClassName}. אנא בצע תשלום בדרך זו על ידי ${dueDate}.`
            : `This is a reminder that you have an outstanding payment for ${enrolledClassName}. Please settle your account by ${dueDate}.`}
        </Text>
      )}

      {/* Payment details card */}
      <div
        style={{
          backgroundColor: '#f0f9ff',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '25px',
          borderLeft: `4px solid ${accentColor || '#ef4444'}`,
          textAlign: isRTL ? 'right' : 'left',
        }}
      >
        <Text
          style={{
            fontSize: '14px',
            fontWeight: '600',
            margin: '0 0 15px 0',
          }}
        >
          {isRTL ? 'פרטי התשלום:' : 'Payment Details:'}
        </Text>

        <Text
          style={{
            fontSize: '14px',
            margin: '8px 0',
          }}
        >
          <strong>{isRTL ? 'סכום תפוקה:' : 'Amount Outstanding:'}</strong>{' '}
          <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
            {amountOutstandingFormatted}
          </span>
        </Text>

        {invoiceId && (
          <Text
            style={{
              fontSize: '14px',
              margin: '8px 0',
            }}
          >
            <strong>{isRTL ? 'מזהה חשבונית:' : 'Invoice ID:'}</strong> {invoiceId}
          </Text>
        )}

        <Text
          style={{
            fontSize: '14px',
            margin: '8px 0',
          }}
        >
          <strong>{isRTL ? 'מועד השלמה:' : 'Due By:'}</strong> {dueDate}
        </Text>

        <Text
          style={{
            fontSize: '14px',
            margin: '8px 0',
          }}
        >
          <strong>{isRTL ? 'כיתה:' : 'Class:'}</strong> {enrolledClassName}
        </Text>
      </div>

      <div style={{ marginBottom: '25px', textAlign: 'center' }}>
        <Button
          href={paymentUrl}
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
          {isRTL ? 'בצע תשלום' : 'Pay Now'}
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
          ? 'או העתק את הקישור הזה בדפדפן שלך כדי להשלים את התשלום:'
          : 'Or copy this link to your browser to complete your payment:'}
      </Text>

      <div
        style={{
          backgroundColor: '#f3f4f6',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '25px',
          wordBreak: 'break-all',
        }}
      >
        <Link
          href={paymentUrl}
          style={{
            color: primaryColor || '#2563eb',
            textDecoration: 'underline',
            fontSize: '12px',
          }}
        >
          {paymentUrl}
        </Link>
      </div>

      {isOverdue && (
        <Text
          style={{
            fontSize: '14px',
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#fee2e2',
            borderRadius: '6px',
            textAlign: isRTL ? 'right' : 'left',
            color: accentColor || '#dc2626',
            lineHeight: '1.6',
          }}
        >
          {isRTL
            ? '⚠️ חשבון שלא שולם עלול להשפיע על ההרשמה בעתיד. אנא בצע תשלום בתאריך המוקדם ביותר האפשרי.'
            : '⚠️ Delinquent accounts may affect future enrollment. Please remit payment at your earliest convenience.'}
        </Text>
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
          ? 'אם בעיה בעיצוב הביצוע או אם יש לך שאלות, בואו נדבר! צוות התמיכה שלנו בהנאה לעזור.'
          : 'If you\'re experiencing difficulty making the payment or have questions, please don\'t hesitate to contact us. Our support team is happy to help.'}
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
