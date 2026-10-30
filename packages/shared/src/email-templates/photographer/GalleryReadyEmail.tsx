import React from 'react';
import ShootEmailLayout, { type ShootEmailCommonProps } from './ShootEmailLayout.js';

export interface GalleryReadyEmailProps extends ShootEmailCommonProps {
  recipientName: string;
  galleryUrl: string;
}

const DEFAULTS = {
  preview: 'Your gallery from {schoolName} is ready',
  greeting: 'Hi {recipientName},',
  body: 'Your photos are ready! Open your gallery to view and download them.',
  cta: 'Open your gallery',
  closing: 'We hope you love them.',
};

export default function GalleryReadyEmail(props: GalleryReadyEmailProps) {
  const { recipientName, galleryUrl, ...common } = props;
  return (
    <ShootEmailLayout {...common} defaults={DEFAULTS} values={{ recipientName }} ctaHref={galleryUrl} />
  );
}
