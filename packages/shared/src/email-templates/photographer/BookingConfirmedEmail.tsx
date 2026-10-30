import React from 'react';
import ShootEmailLayout, { type ShootEmailCommonProps } from './ShootEmailLayout.js';

export interface BookingConfirmedEmailProps extends ShootEmailCommonProps {
  recipientName: string;
  shootDate: string;
  totalFormatted: string;
  depositFormatted: string;
  balanceFormatted: string;
  balanceDueDate: string;
  quoteUrl: string;
  /** Step 1: contract signing link (omit when there is no contract to sign). */
  signUrl?: string;
  /** Step 2: deposit pay link (omit when there is no unpaid deposit). */
  payUrl?: string;
}

const DEFAULTS = {
  preview: 'Your booking with {schoolName} is confirmed',
  greeting: 'Hi {recipientName},',
  body: 'Thank you for accepting the quote. Your shoot is booked! Payment details will follow in a separate message.',
  details_heading: 'Booking summary',
  shoot_date_label: 'Shoot date',
  total_label: 'Total',
  deposit_label: 'Deposit',
  balance_label: 'Balance',
  balance_due_label: 'Balance due',
  cta: 'View your booking',
  closing: 'We are looking forward to it.',
  body_next_steps: 'Thank you for accepting the quote. Your shoot is booked! To finish, please:',
  step_sign: 'Sign the contract.',
  step_sign_cta: 'Sign the contract',
  step_pay: 'Pay the deposit of {depositFormatted}.',
  step_pay_cta: 'Pay the deposit',
};

export default function BookingConfirmedEmail(props: BookingConfirmedEmailProps) {
  const {
    recipientName, shootDate, totalFormatted, depositFormatted, balanceFormatted, balanceDueDate, quoteUrl,
    signUrl, payUrl,
    ...common
  } = props;
  // Sign first, then pay — the order the client should do them in.
  const steps = [
    ...(signUrl ? [{ textKey: 'step_sign', ctaKey: 'step_sign_cta', href: signUrl }] : []),
    ...(payUrl ? [{ textKey: 'step_pay', ctaKey: 'step_pay_cta', href: payUrl }] : []),
  ];
  return (
    <ShootEmailLayout
      {...common}
      defaults={DEFAULTS}
      values={{ recipientName, depositFormatted }}
      bodyKey={steps.length > 0 ? 'body_next_steps' : 'body'}
      steps={steps}
      rows={[
        { labelKey: 'shoot_date_label', value: shootDate },
        { labelKey: 'total_label', value: totalFormatted },
        { labelKey: 'deposit_label', value: depositFormatted },
        { labelKey: 'balance_label', value: balanceFormatted },
        { labelKey: 'balance_due_label', value: balanceDueDate },
      ]}
      ctaHref={quoteUrl}
    />
  );
}
