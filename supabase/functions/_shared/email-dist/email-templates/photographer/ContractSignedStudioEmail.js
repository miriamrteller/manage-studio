/* @ts-self-types="./ContractSignedStudioEmail.d.ts" */
import { jsx as _jsx } from "react/jsx-runtime";
import ShootEmailLayout from './ShootEmailLayout.js';
const DEFAULTS = {
    preview: '{clientName} signed the contract',
    greeting: 'Hello,',
    body: '{clientName} has signed the shoot contract. Download the signed PDF with the button below or from the shoot page at any time.',
    details_heading: 'Contract summary',
    client_label: 'Client',
    shoot_date_label: 'Shoot date',
    package_label: 'Package',
    signed_at_label: 'Signed at',
    cta: 'Download the signed contract',
    closing: 'This copy was sent automatically when the client signed.',
};
export default function ContractSignedStudioEmail(props) {
    const { clientName, shootDate, packageName, signedAt, downloadUrl, ...common } = props;
    return (_jsx(ShootEmailLayout, { ...common, defaults: DEFAULTS, values: { clientName }, rows: [
            { labelKey: 'client_label', value: clientName },
            { labelKey: 'shoot_date_label', value: shootDate },
            { labelKey: 'package_label', value: packageName },
            { labelKey: 'signed_at_label', value: signedAt },
        ], ctaHref: downloadUrl }));
}
