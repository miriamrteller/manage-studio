/* @ts-self-types="./ReviewRequestEmail.d.ts" */
import { jsx as _jsx } from "react/jsx-runtime";
import ShootEmailLayout from './ShootEmailLayout.js';
const DEFAULTS = {
    preview: 'How was your shoot with {schoolName}?',
    greeting: 'Hi {recipientName},',
    body: "We hope you're enjoying your photos! If you have a minute, a few words about your experience would mean a lot to us and help others find us.",
    cta: 'Leave a review',
    closing: 'Thank you, {schoolName}',
};
export default function ReviewRequestEmail(props) {
    const { recipientName, reviewUrl, ...common } = props;
    return (_jsx(ShootEmailLayout, { ...common, defaults: DEFAULTS, values: { recipientName }, ctaHref: reviewUrl }));
}
