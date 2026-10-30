/* @ts-self-types="./ContractSignedEmail.d.ts" */
import { jsx as _jsx } from "react/jsx-runtime";
import ShootEmailLayout from './ShootEmailLayout.js';
const DEFAULTS = {
    preview: 'Your signed contract with {schoolName}',
    greeting: 'Hi {recipientName},',
    body: 'Thank you for signing. Download your copy of the signed contract with the button below. The link works for 72 hours; your client portal always has a fresh one.',
    details_heading: 'Contract summary',
    shoot_date_label: 'Shoot date',
    package_label: 'Package',
    signed_at_label: 'Signed at',
    cta: 'Download the signed contract',
    closing: 'Keep this email for your records.',
};
export default function ContractSignedEmail(props) {
    const { recipientName, shootDate, packageName, signedAt, downloadUrl, ...common } = props;
    return (_jsx(ShootEmailLayout, { ...common, defaults: DEFAULTS, values: { recipientName }, rows: [
            { labelKey: 'shoot_date_label', value: shootDate },
            { labelKey: 'package_label', value: packageName },
            { labelKey: 'signed_at_label', value: signedAt },
        ], ctaHref: downloadUrl }));
}
