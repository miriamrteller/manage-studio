import React from 'react';
import ShootEmailLayout, { type ShootEmailCommonProps } from './ShootEmailLayout.js';

export interface ShootThankYouEmailProps extends ShootEmailCommonProps {
  recipientName: string;
}

const DEFAULTS = {
  preview: 'Thank you from {schoolName}',
  greeting: 'Hi {recipientName},',
  body: 'Thank you for the shoot! We are editing your photos now and will let you know as soon as your gallery is ready.',
  closing: 'Warm regards, {schoolName}',
};

export default function ShootThankYouEmail(props: ShootThankYouEmailProps) {
  const { recipientName, ...common } = props;
  return <ShootEmailLayout {...common} defaults={DEFAULTS} values={{ recipientName }} />;
}
