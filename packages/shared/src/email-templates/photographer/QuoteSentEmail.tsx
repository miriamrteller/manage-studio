import React from 'react';
import ShootEmailLayout, { type ShootEmailCommonProps } from './ShootEmailLayout.js';

export interface QuoteSentEmailProps extends ShootEmailCommonProps {
  recipientName: string;
  quoteUrl: string;
  totalFormatted: string;
  validUntil: string;
  shootDate: string;
}

const DEFAULTS = {
  preview: 'Your quote from {schoolName} is ready',
  greeting: 'Hi {recipientName},',
  body: 'Thank you for getting in touch. Your quote is ready: you can choose add-ons and confirm your booking online.',
  details_heading: 'Quote summary',
  shoot_date_label: 'Shoot date',
  total_label: 'Total',
  valid_until_label: 'Valid until',
  cta: 'View your quote',
  closing: 'Questions? Just reply to this email.',
};

export default function QuoteSentEmail(props: QuoteSentEmailProps) {
  const { recipientName, quoteUrl, totalFormatted, validUntil, shootDate, ...common } = props;
  return (
    <ShootEmailLayout
      {...common}
      defaults={DEFAULTS}
      values={{ recipientName }}
      rows={[
        { labelKey: 'shoot_date_label', value: shootDate },
        { labelKey: 'total_label', value: totalFormatted },
        { labelKey: 'valid_until_label', value: validUntil },
      ]}
      ctaHref={quoteUrl}
    />
  );
}
