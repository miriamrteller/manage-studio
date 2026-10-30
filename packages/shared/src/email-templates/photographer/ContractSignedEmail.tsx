import React from 'react';
import ShootEmailLayout, { type ShootEmailCommonProps } from './ShootEmailLayout.js';

/** Client copy of the signed shoot contract (PDF attached or linked). */
export interface ContractSignedEmailProps extends ShootEmailCommonProps {
  recipientName: string;
  shootDate: string;
  packageName: string;
  signedAt: string;
  downloadUrl: string;
}

const DEFAULTS = {
  preview: 'Your signed contract with {schoolName}',
  greeting: 'Hi {recipientName},',
  body: 'Thank you for signing. Your copy of the signed contract is attached to this email and can also be downloaded with the button below (the link works for 72 hours; your client portal always has a fresh one).',
  details_heading: 'Contract summary',
  shoot_date_label: 'Shoot date',
  package_label: 'Package',
  signed_at_label: 'Signed at',
  cta: 'Download the signed contract',
  closing: 'Keep this email for your records.',
};

export default function ContractSignedEmail(props: ContractSignedEmailProps) {
  const { recipientName, shootDate, packageName, signedAt, downloadUrl, ...common } = props;
  return (
    <ShootEmailLayout
      {...common}
      defaults={DEFAULTS}
      values={{ recipientName }}
      rows={[
        { labelKey: 'shoot_date_label', value: shootDate },
        { labelKey: 'package_label', value: packageName },
        { labelKey: 'signed_at_label', value: signedAt },
      ]}
      ctaHref={downloadUrl}
    />
  );
}
