import React from 'react';
import ShootEmailLayout, { type ShootEmailCommonProps } from './ShootEmailLayout.js';

export interface ShootCancelledEmailProps extends ShootEmailCommonProps {
  recipientName: string;
  shootDate: string;
  shootTime: string;
}

const DEFAULTS = {
  preview: 'Your shoot with {schoolName} is cancelled',
  greeting: 'Hi {recipientName},',
  body: 'Your shoot with us has been cancelled. Any payment links we sent you for it no longer work.',
  details_heading: 'Cancelled shoot',
  shoot_date_label: 'Date',
  shoot_time_label: 'Time',
  closing: 'Questions, or want to book another date? Just reply to this email.',
};

export default function ShootCancelledEmail(props: ShootCancelledEmailProps) {
  const { recipientName, shootDate, shootTime, ...common } = props;
  return (
    <ShootEmailLayout
      {...common}
      defaults={DEFAULTS}
      values={{ recipientName }}
      rows={[
        { labelKey: 'shoot_date_label', value: shootDate },
        { labelKey: 'shoot_time_label', value: shootTime },
      ]}
    />
  );
}
