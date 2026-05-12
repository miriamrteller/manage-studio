import React from 'react';
import {
  Button,
  Text,
} from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';

interface WaitingListOfferEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  recipientName: string;
  className: string;
  availableSlots: number;
  offerExpiryDate: string;
  enrollNowUrl: string;
  classDetails?: {
    startDate?: string;
    endDate?: string;
    day?: string;
    time?: string;
    teacher?: string;
  };
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  bgColor?: string;
  direction?: 'ltr' | 'rtl';
}

/**
 * Waiting List Offer Email Template
 * Sent when a space opens up in a class that user was waitlisted for
 * Time-limited offer with CTA to enroll
 */
export default function WaitingListOfferEmail({
  schoolName,
  schoolLogoUrl,
  recipientName,
  className,
  availableSlots,
  offerExpiryDate,
  enrollNowUrl,
  classDetails,
  primaryColor,
  accentColor,
  textColor,
  bgColor,
  direction = 'ltr',
}: WaitingListOfferEmailProps) {
  const isRTL = direction === 'rtl';

  return (
    <BaseEmailTemplate
      previewText={`Space Available in ${className} - Offer Expires ${offerExpiryDate}`}
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
          fontSize: '18px',
          fontWeight: 'bold',
          marginBottom: '15px',
          textAlign: isRTL ? 'right' : 'left',
          color: accentColor || '#10b981',
        }}
      >
        {isRTL ? '🎉 מקום זמין!' : '🎉 A Space is Available!'}
      </Text>

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
          marginBottom: '25px',
          textAlign: isRTL ? 'right' : 'left',
          lineHeight: '1.6',
        }}
      >
        {isRTL
          ? `יש לנו חדשות מעולות! ${availableSlots} מקום${availableSlots > 1 ? 'ות' : ''} פתוח${availableSlots > 1 ? 'ות' : ''} ב${className} שעליו בקשת להיות בטבעת ההמתנה.`
          : `Great news! ${availableSlots} ${availableSlots > 1 ? 'space is' : 'spaces are'} now available in ${className}, the class you've been waitlisted for.`}
      </Text>

      {/* Class details card */}
      <div
        style={{
          backgroundColor: '#f0fdf4',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '25px',
          borderLeft: `4px solid ${accentColor || '#10b981'}`,
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
          {isRTL ? 'פרטי הכיתה:' : 'Class Details:'}
        </Text>

        <Text
          style={{
            fontSize: '14px',
            margin: '8px 0',
          }}
        >
          <strong>{isRTL ? 'כיתה:' : 'Class:'}</strong> {className}
        </Text>

        {classDetails?.day && (
          <Text
            style={{
              fontSize: '14px',
              margin: '8px 0',
            }}
          >
            <strong>{isRTL ? 'יום:' : 'Day:'}</strong> {classDetails.day}
          </Text>
        )}

        {classDetails?.time && (
          <Text
            style={{
              fontSize: '14px',
              margin: '8px 0',
            }}
          >
            <strong>{isRTL ? 'זמן:' : 'Time:'}</strong> {classDetails.time}
          </Text>
        )}

        {classDetails?.startDate && classDetails?.endDate && (
          <Text
            style={{
              fontSize: '14px',
              margin: '8px 0',
            }}
          >
            <strong>{isRTL ? 'תאריכים:' : 'Dates:'}</strong> {classDetails.startDate} {isRTL ? 'עד' : 'to'}{' '}
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
            <strong>{isRTL ? 'מורה:' : 'Instructor:'}</strong> {classDetails.teacher}
          </Text>
        )}
      </div>

      <Text
        style={{
          fontSize: '16px',
          marginBottom: '25px',
          textAlign: isRTL ? 'right' : 'left',
          lineHeight: '1.6',
        }}
      >
        {isRTL
          ? 'בקש על משהו כזה? כל שעליך לעשות הוא להקליק על הכפתור למטה כדי לאשר את המקום שלך עכשיו!'
          : 'Was waiting for this? All you need to do is click the button below to secure your spot now!'}
      </Text>

      <div style={{ marginBottom: '25px', textAlign: 'center' }}>
        <Button
          href={enrollNowUrl}
          style={{
            backgroundColor: accentColor || '#10b981',
            color: '#ffffff',
            padding: '14px 40px',
            borderRadius: '6px',
            textDecoration: 'none',
            display: 'inline-block',
            fontWeight: '600',
            fontSize: '16px',
          }}
        >
          {isRTL ? 'הרשמה עכשיו' : 'Enroll Now'}
        </Button>
      </div>

      {/* Expiry notice */}
      <div
        style={{
          backgroundColor: '#fef3c7',
          padding: '15px',
          borderRadius: '6px',
          marginBottom: '25px',
          textAlign: isRTL ? 'right' : 'left',
          borderLeft: `4px solid #f59e0b`,
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
          ⏰ {isRTL ? 'הצעה מוגבלת בזמן:' : '⏰ Limited Time Offer:'}
        </Text>
        <Text
          style={{
            fontSize: '14px',
            margin: '0',
            color: '#92400e',
          }}
        >
          {isRTL
            ? `הצעה זו חל עד ${offerExpiryDate}. לאחר מכן, המקום עלול להיות הנתון לאישור מחדש.`
            : `This offer expires on ${offerExpiryDate}. After that date, the spot may be offered to other waitlisted students.`}
        </Text>
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
          ? 'אם יש לך שאלות או אם אתה זקוק לעזרה בתהליך ההרשמה, אנא צור קשר עם צוות התמיכה שלנו.'
          : 'If you have any questions or need help with enrollment, please don\'t hesitate to contact our support team.'}
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
