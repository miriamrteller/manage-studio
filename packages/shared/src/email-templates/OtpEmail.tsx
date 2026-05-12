import React from 'react';
import {
  Button,
  Text,
} from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';

interface OtpEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  otpCode: string;
  expiresInMinutes?: number;
  recipientName?: string;
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  bgColor?: string;
  direction?: 'ltr' | 'rtl';
  usageContext?: 'whatsapp_verification' | 'email_verification' | 'security_reset';
}

/**
 * OTP Email Template
 * Sent when user needs to verify email/WhatsApp or reset account
 * Expires in 10 minutes by default
 * 6-digit code + fallback plain-text display
 */
export default function OtpEmail({
  schoolName,
  schoolLogoUrl,
  otpCode,
  expiresInMinutes = 10,
  recipientName,
  primaryColor,
  accentColor,
  textColor,
  bgColor,
  direction = 'ltr',
  usageContext = 'email_verification',
}: OtpEmailProps) {
  const isRTL = direction === 'rtl';

  const contextMessages = {
    whatsapp_verification: {
      he: `כדי לוודא את מספר הווטסאפ שלך ב${schoolName}, השתמש בקוד זה:`,
      en: `To verify your WhatsApp number with ${schoolName}, use this code:`,
    },
    email_verification: {
      he: `כדי לוודא את כתובת הדואר האלקטרוני שלך ב${schoolName}, השתמש בקוד זה:`,
      en: `To verify your email address with ${schoolName}, use this code:`,
    },
    security_reset: {
      he: `כדי לאפס את הסיסמה שלך ב${schoolName}, השתמש בקוד זה:`,
      en: `To reset your password with ${schoolName}, use this code:`,
    },
  };

  const contextLabels = {
    whatsapp_verification: {
      he: 'אימות WhatsApp',
      en: 'WhatsApp Verification',
    },
    email_verification: {
      he: 'אימות דואר אלקטרוני',
      en: 'Email Verification',
    },
    security_reset: {
      he: 'איפוס סיסמה',
      en: 'Password Reset',
    },
  };

  const headings = {
    he: 'קוד האימות שלך',
    en: 'Your Verification Code',
  };

  const lang = direction === 'rtl' ? 'he' : 'en';

  return (
    <BaseEmailTemplate
      previewText={headings[lang]}
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
          marginBottom: '20px',
          textAlign: isRTL ? 'right' : 'left',
        }}
      >
        {recipientName
          ? (isRTL ? `שלום ${recipientName},` : `Hello ${recipientName},`)
          : (isRTL ? 'שלום,' : 'Hello,')}
      </Text>

      <Text
        style={{
          fontSize: '16px',
          marginBottom: '30px',
          textAlign: isRTL ? 'right' : 'left',
          lineHeight: '1.6',
        }}
      >
        {contextMessages[usageContext][lang]}
      </Text>

      {/* Large OTP code display - accessibility: visible both as large text and with copyable format */}
      <div
        style={{
          backgroundColor: primaryColor || '#2563eb',
          color: '#ffffff',
          padding: '30px',
          borderRadius: '8px',
          textAlign: 'center',
          marginBottom: '30px',
        }}
      >
        <Text
          style={{
            fontSize: '12px',
            margin: '0 0 15px 0',
            opacity: '0.9',
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          {contextLabels[usageContext][lang]}
        </Text>
        <div
          style={{
            fontSize: '48px',
            fontWeight: 'bold',
            letterSpacing: '8px',
            fontFamily: '"Courier New", monospace',
            margin: '10px 0',
            wordBreak: 'break-all',
          }}
        >
          {otpCode.split('').join(' ')}
        </div>
      </div>

      {/* Fallback: copy-pasteable code */}
      <div
        style={{
          backgroundColor: '#f3f4f6',
          padding: '15px',
          borderRadius: '4px',
          marginBottom: '25px',
          textAlign: 'center',
          fontFamily: '"Courier New", monospace',
          fontSize: '18px',
          fontWeight: 'bold',
        }}
      >
        {otpCode}
      </div>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '20px',
          textAlign: 'center',
          color: accentColor || '#ef4444',
        }}
      >
        ⏰ {isRTL ? `קוד זה יפוג בעוד ${expiresInMinutes} דקות` : `This code expires in ${expiresInMinutes} minutes`}
      </Text>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '20px',
          textAlign: isRTL ? 'right' : 'left',
          color: '#6b7280',
          lineHeight: '1.6',
        }}
      >
        {isRTL
          ? 'אם לא ביצעת בקשה זו, אנא התעלם מהודעה זו. אם אתה חושד שלחשבונך יש בעיה, אנא צור קשר עם צוות התמיכה שלנו באופן מיידי.'
          : 'If you didn\'t request this code, please ignore this message. If you believe your account has been compromised, please contact our support team immediately.'}
      </Text>

      <Text
        style={{
          fontSize: '12px',
          color: '#9ca3af',
          textAlign: isRTL ? 'right' : 'left',
          marginTop: '20px',
          paddingTop: '15px',
          borderTop: '1px solid #e5e7eb',
        }}
      >
        {isRTL
          ? 'זהו קוד זמני. אל תשתף אותו עם כל אחד.'
          : 'This is a temporary code. Never share it with anyone.'}
      </Text>
    </BaseEmailTemplate>
  );
}
