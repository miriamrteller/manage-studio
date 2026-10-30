import React from 'react';
import ShootEmailLayout, { type ShootEmailCommonProps } from './ShootEmailLayout.js';

export interface ShootReminderEmailProps extends ShootEmailCommonProps {
  recipientName: string;
  shootDate: string;
  shootTime: string;
  location: string;
}

const DEFAULTS = {
  preview: 'Your shoot with {schoolName} is coming up',
  greeting: 'Hi {recipientName},',
  body: 'A quick reminder that your shoot is coming up in two days.',
  details_heading: 'Shoot details',
  shoot_date_label: 'Date',
  shoot_time_label: 'Time',
  location_label: 'Location',
  closing: 'Need to change something? Just reply to this email.',
};

export default function ShootReminderEmail(props: ShootReminderEmailProps) {
  const { recipientName, shootDate, shootTime, location, ...common } = props;
  return (
    <ShootEmailLayout
      {...common}
      defaults={DEFAULTS}
      values={{ recipientName }}
      rows={[
        { labelKey: 'shoot_date_label', value: shootDate },
        { labelKey: 'shoot_time_label', value: shootTime },
        { labelKey: 'location_label', value: location },
      ]}
    />
  );
}
