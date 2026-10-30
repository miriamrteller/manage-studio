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
};

export default function BookingConfirmedEmail(props: BookingConfirmedEmailProps) {
  const {
    recipientName, shootDate, totalFormatted, depositFormatted, balanceFormatted, balanceDueDate, quoteUrl,
    ...common
  } = props;
  return (
    <ShootEmailLayout
      {...common}
      defaults={DEFAULTS}
      values={{ recipientName }}
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
