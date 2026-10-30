import React from 'react';
import ShootEmailLayout, { type ShootEmailCommonProps } from './ShootEmailLayout.js';

/** Photographer's copy: a client signed their shoot contract. */
export interface ContractSignedStudioEmailProps extends ShootEmailCommonProps {
  clientName: string;
  shootDate: string;
  packageName: string;
  signedAt: string;
  downloadUrl: string;
}

const DEFAULTS = {
  preview: '{clientName} signed the contract',
  greeting: 'Hello,',
  body: '{clientName} has signed the shoot contract. The signed PDF is attached and can be downloaded from the shoot page at any time.',
  details_heading: 'Contract summary',
  client_label: 'Client',
  shoot_date_label: 'Shoot date',
  package_label: 'Package',
  signed_at_label: 'Signed at',
  cta: 'Download the signed contract',
  closing: 'This copy was sent automatically when the client signed.',
};

export default function ContractSignedStudioEmail(props: ContractSignedStudioEmailProps) {
  const { clientName, shootDate, packageName, signedAt, downloadUrl, ...common } = props;
  return (
    <ShootEmailLayout
      {...common}
      defaults={DEFAULTS}
      values={{ clientName }}
      rows={[
        { labelKey: 'client_label', value: clientName },
        { labelKey: 'shoot_date_label', value: shootDate },
        { labelKey: 'package_label', value: packageName },
        { labelKey: 'signed_at_label', value: signedAt },
      ]}
      ctaHref={downloadUrl}
    />
  );
}
