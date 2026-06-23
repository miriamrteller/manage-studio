import React from 'react';
import { Button, Text } from '@react-email/components';
import BaseEmailTemplate, { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
import { EmailDetailsTable } from './primitives/EmailDetailsTable.js';

interface EnrolmentConfirmationEmailProps {
  schoolName: string;
  schoolLogoUrl?: string;
  language: 'en' | 'he';
  colors?: EmailColorConfig;
  footerStrings?: EmailFooterStrings;
  strings?: {
    subject?: string;
    preview?: string;
    greeting?: string;
    enrollment_confirmed?: string;
    enrollment_confirmed_for_student?: string;
    enrollment_reserved?: string;
    enrollment_reserved_for_student?: string;
    class_details_heading?: string;
    payment_summary_heading?: string;
    student_label?: string;
    class_label?: string;
    day_label?: string;
    time_label?: string;
    start_date_label?: string;
    teacher_label?: string;
    location_label?: string;
    amount_paid_label?: string;
    paid_on_label?: string;
    payment_method_label?: string;
    tax_invoice_label?: string;
    tax_invoice_notice?: string;
    waiver_warning_heading?: string;
    waiver_warning_body?: string;
    waiver_cta?: string;
    link_expires?: string;
    no_show_policy?: string;
    confirmation_note?: string;
  };
  recipientName: string;
  studentName: string;
  showStudentRow?: boolean;
  className: string;
  classDetails?: {
    day?: string;
    time?: string;
    startDate?: string;
    teacher?: string;
  };
  location?: string;
  paymentSummary: {
    amountFormatted: string;
    paidOnFormatted: string;
    paymentMethodLabel: string;
  };
  pendingWaiver: boolean;
  signUrl?: string;
  deadlineDate?: string;
}

const DEFAULT_STRINGS = {
  subject: 'Your enrollment at {schoolName}',
  preview: 'Enrollment confirmation for {className}',
  greeting: 'Hi {recipientName},',
  enrollment_confirmed: 'Your enrollment in {className} is confirmed!',
  enrollment_confirmed_for_student: "{studentName}'s enrollment in {className} is confirmed!",
  enrollment_reserved: 'Your spot in {className} is reserved.',
  enrollment_reserved_for_student: "{studentName}'s spot in {className} is reserved.",
  class_details_heading: 'Class details',
  payment_summary_heading: 'Payment summary',
  student_label: 'Student',
  class_label: 'Class',
  day_label: 'Day',
  time_label: 'Time',
  start_date_label: 'Starts',
  teacher_label: 'Instructor',
  location_label: 'Location',
  amount_paid_label: 'Amount paid',
  paid_on_label: 'Paid on',
  payment_method_label: 'Payment method',
  tax_invoice_label: 'Tax invoice',
  tax_invoice_notice:
    'Your official tax invoice will be sent to this email address in a separate message once it has been issued.',
  waiver_warning_heading: 'ACTION REQUIRED: Sign your waiver',
  waiver_warning_body:
    'Your spot is reserved but your enrollment is NOT active. You will not be permitted to attend class until the waiver is signed. Classes missed while your waiver is pending are not eligible for refund, credit, or makeup.',
  waiver_cta: 'Sign Your Waiver Now',
  link_expires:
    'This link expires in 1 hour. If it has expired, visit the link in this email and enter your email address to receive a new one.',
  no_show_policy:
    'Deadline: {deadlineDate}. If the waiver is not signed by this date, your enrollment will be automatically cancelled and a full refund issued.',
  confirmation_note: 'Please contact us if you have any questions.',
};

export default function EnrolmentConfirmationEmail({
  schoolName,
  schoolLogoUrl,
  language,
  colors,
  footerStrings,
  strings,
  recipientName,
  studentName,
  showStudentRow = false,
  className,
  classDetails,
  location,
  paymentSummary,
  pendingWaiver,
  signUrl,
  deadlineDate,
}: EnrolmentConfirmationEmailProps) {
  const s = { ...DEFAULT_STRINGS, ...strings };

  const greeting = s.greeting.replace('{recipientName}', recipientName);
  const preview = s.preview.replace('{className}', className);

  const mainTextTemplate = pendingWaiver
    ? showStudentRow
      ? s.enrollment_reserved_for_student
      : s.enrollment_reserved
    : showStudentRow
      ? s.enrollment_confirmed_for_student
      : s.enrollment_confirmed;

  const mainText = mainTextTemplate
    .replace('{className}', className)
    .replace('{studentName}', studentName);

  const classRows: Array<{ label: string; value: string }> = [
    ...(showStudentRow ? [{ label: s.student_label, value: studentName }] : []),
    { label: s.class_label, value: className },
    ...(classDetails?.day ? [{ label: s.day_label, value: classDetails.day }] : []),
    ...(classDetails?.time ? [{ label: s.time_label, value: classDetails.time }] : []),
    ...(classDetails?.startDate ? [{ label: s.start_date_label, value: classDetails.startDate }] : []),
    ...(classDetails?.teacher ? [{ label: s.teacher_label, value: classDetails.teacher }] : []),
    ...(location ? [{ label: s.location_label, value: location }] : []),
  ];

  const paymentRows: Array<{ label: string; value: string }> = [
    { label: s.amount_paid_label, value: paymentSummary.amountFormatted },
    { label: s.paid_on_label, value: paymentSummary.paidOnFormatted },
    { label: s.payment_method_label, value: paymentSummary.paymentMethodLabel },
    { label: s.tax_invoice_label, value: s.tax_invoice_notice },
  ];

  const formattedDeadline = deadlineDate
    ? new Date(deadlineDate).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  return (
    <BaseEmailTemplate
      previewText={preview}
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      language={language}
      colors={colors}
      footerStrings={footerStrings}
    >
      <Text style={{ fontSize: '16px', marginBottom: '10px' }}>{greeting}</Text>
      <Text style={{ fontSize: '16px', marginBottom: '20px', lineHeight: '1.6', fontWeight: 600 }}>
        {mainText}
      </Text>

      <EmailDetailsTable heading={s.class_details_heading} rows={classRows} />
      <EmailDetailsTable heading={s.payment_summary_heading} rows={paymentRows} />

      {pendingWaiver && (
        <div
          style={{
            backgroundColor: '#fef3c7',
            border: '2px solid #f59e0b',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <Text
            style={{
              fontSize: '15px',
              fontWeight: '700',
              color: '#92400e',
              margin: '0 0 10px 0',
            }}
          >
            {s.waiver_warning_heading}
          </Text>
          <Text
            style={{
              fontSize: '14px',
              color: '#78350f',
              lineHeight: '1.6',
              margin: '0 0 16px 0',
            }}
          >
            {s.waiver_warning_body}
          </Text>

          {signUrl && (
            <>
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <Button
                  href={signUrl}
                  style={{
                    backgroundColor: '#b45309',
                    color: '#ffffff',
                    padding: '12px 28px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    display: 'inline-block',
                    fontWeight: '700',
                    fontSize: '15px',
                  }}
                >
                  {s.waiver_cta}
                </Button>
              </div>
              <Text style={{ fontSize: '12px', color: '#92400e', margin: '0 0 8px 0' }}>
                {s.link_expires}
              </Text>
            </>
          )}

          {formattedDeadline && (
            <Text style={{ fontSize: '13px', color: '#78350f', margin: 0 }}>
              {s.no_show_policy.replace('{deadlineDate}', formattedDeadline)}
            </Text>
          )}
        </div>
      )}

      <Text
        style={{
          fontSize: '14px',
          color: '#6b7280',
          lineHeight: '1.6',
          marginBottom: '10px',
        }}
      >
        {s.confirmation_note}
      </Text>
    </BaseEmailTemplate>
  );
}
