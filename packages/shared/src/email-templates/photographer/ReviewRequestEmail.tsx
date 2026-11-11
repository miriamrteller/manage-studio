import React from 'react';
import ShootEmailLayout, { type ShootEmailCommonProps } from './ShootEmailLayout.js';

export interface ReviewRequestEmailProps extends ShootEmailCommonProps {
  recipientName: string;
  reviewUrl: string;
}

const DEFAULTS = {
  preview: 'How was your shoot with {schoolName}?',
  greeting: 'Hi {recipientName},',
  body: "We hope you're enjoying your photos! If you have a minute, a few words about your experience would mean a lot to us and help others find us.",
  cta: 'Leave a review',
  closing: 'Thank you, {schoolName}',
};

export default function ReviewRequestEmail(props: ReviewRequestEmailProps) {
  const { recipientName, reviewUrl, ...common } = props;
  return (
    <ShootEmailLayout {...common} defaults={DEFAULTS} values={{ recipientName }} ctaHref={reviewUrl} />
  );
}
