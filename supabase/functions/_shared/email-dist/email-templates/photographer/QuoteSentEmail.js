import { jsx as _jsx } from "react/jsx-runtime";
import ShootEmailLayout from './ShootEmailLayout.js';
const DEFAULTS = {
    preview: 'Your quote from {schoolName} is ready',
    greeting: 'Hi {recipientName},',
    body: 'Thank you for getting in touch. Your quote is ready: you can choose add-ons and confirm your booking online.',
    details_heading: 'Quote summary',
    shoot_date_label: 'Shoot date',
    total_label: 'Total',
    valid_until_label: 'Valid until',
    cta: 'View your quote',
    closing: 'Questions? Just reply to this email.',
};
export default function QuoteSentEmail(props) {
    const { recipientName, quoteUrl, totalFormatted, validUntil, shootDate, ...common } = props;
    return (_jsx(ShootEmailLayout, { ...common, defaults: DEFAULTS, values: { recipientName }, rows: [
            { labelKey: 'shoot_date_label', value: shootDate },
            { labelKey: 'total_label', value: totalFormatted },
            { labelKey: 'valid_until_label', value: validUntil },
        ], ctaHref: quoteUrl }));
}
