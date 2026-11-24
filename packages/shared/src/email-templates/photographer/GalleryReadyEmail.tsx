import React from 'react';
import ShootEmailLayout, { type ShootEmailCommonProps } from './ShootEmailLayout.js';

export interface GalleryReadyEmailProps extends ShootEmailCommonProps {
  recipientName: string;
  galleryUrl: string;
}

const DEFAULTS = {
  preview: 'Your gallery from {schoolName} is ready',
  greeting: 'Dear {recipientName},',
  body: 'Your photos are ready! Open your gallery to choose your photos.',
  cta: 'Open your gallery',
  closing: 'We hope you love them.',
};

export default function GalleryReadyEmail(props: GalleryReadyEmailProps) {
  const { recipientName, galleryUrl, ...common } = props;
  return (
    <ShootEmailLayout {...common} defaults={DEFAULTS} values={{ recipientName }} ctaHref={galleryUrl} />
  );
}
