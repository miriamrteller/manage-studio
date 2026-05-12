import React from 'react';
import {
  Button,
  Link,
  Text,
} from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';

interface MagicLinkEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  magicLinkUrl: string;
  expiresInMinutes?: number;
  recipientName?: string;
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  bgColor?: string;
  direction?: 'ltr' | 'rtl';
}

/**
 * Magic Link Email Template
 * Sent during login flow (Phase 1B auth)
 * Expires in 15 minutes by default
 * Includes fallback plain-text link for accessibility
 */
export default function MagicLinkEmail({
  schoolName,
  schoolLogoUrl,
  magicLinkUrl,
  expiresInMinutes = 15,
  recipientName,
  primaryColor,
  accentColor,
  textColor,
  bgColor,
  direction = 'ltr',
}: MagicLinkEmailProps) {
  const isRTL = direction === 'rtl';

  return (
    <BaseEmailTemplate
      previewText={`Sign in to ${schoolName}`}
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
          ? isRTL
            ? `שלום ${recipientName},`
            : `Hello ${recipientName},`
          : isRTL
          ? 'שלום,'
          : 'Hello,'}
      </Text>

      <Text
        style={{
          fontSize: '16px',
          marginBottom: '20px',
          textAlign: isRTL ? 'right' : 'left',
          lineHeight: '1.6',
        }}
      >
        {direction === 'rtl'
          ? `קיבלנו בקשה להיכנס לחשבון ${schoolName} שלך. אם לא ביצעת פעולה זו, אתה יכול להתעלם מהודעה זו.`
          : `We received a request to sign in to your ${schoolName} account. If you didn't make this request, you can ignore this message.`}
      </Text>

      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <Button
          href={magicLinkUrl}
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
          {direction === 'rtl' ? 'הכנס לחשבון' : 'Sign In'}
        </Button>
      </div>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '15px',
          textAlign: isRTL ? 'right' : 'left',
          color: '#6b7280',
        }}
      >
        {direction === 'rtl'
          ? 'או העתק וקבע את הקישור הזה בדפדפן שלך:'
          : 'Or copy and paste this link in your browser:'}
      </Text>

      <div
        style={{
          backgroundColor: '#f3f4f6',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '20px',
          wordBreak: 'break-all',
        }}
      >
        <Link
          href={magicLinkUrl}
          style={{
            color: primaryColor || '#2563eb',
            textDecoration: 'underline',
            fontSize: '12px',
          }}
        >
          {magicLinkUrl}
        </Link>
      </div>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '20px',
          textAlign: isRTL ? 'right' : 'left',
          color: '#ef4444',
        }}
      >
        {direction === 'rtl'
          ? `⏰ קישור זה יפוג תוך ${expiresInMinutes} דקות`
          : `⏰ This link expires in ${expiresInMinutes} minutes`}
      </Text>

      <Text
        style={{
          fontSize: '14px',
          marginBottom: '10px',
          textAlign: isRTL ? 'right' : 'left',
          color: '#6b7280',
        }}
      >
        {direction === 'rtl'
          ? 'אם יש לך שאלות, אנא צור קשר עם צוות התמיכה.'
          : 'If you have any questions, please contact our support team.'}
      </Text>

      <Text
        style={{
          fontSize: '13px',
          color: '#9ca3af',
          textAlign: isRTL ? 'right' : 'left',
          marginTop: '20px',
        }}
      >
        {direction === 'rtl'
          ? 'סימן זה: Magic Link for sign-in'
          : 'Tag: Magic Link for sign-in'}
      </Text>
    </BaseEmailTemplate>
  );
}
