/* @ts-self-types="./ShootThankYouEmail.d.ts" */
import { jsx as _jsx } from "react/jsx-runtime";
import ShootEmailLayout from './ShootEmailLayout.js';
const DEFAULTS = {
    preview: 'Thank you from {schoolName}',
    greeting: 'Hi {recipientName},',
    body: 'Thank you for the shoot! We are editing your photos now and will let you know as soon as your gallery is ready.',
    closing: 'Warm regards, {schoolName}',
};
export default function ShootThankYouEmail(props) {
    const { recipientName, ...common } = props;
    return _jsx(ShootEmailLayout, { ...common, defaults: DEFAULTS, values: { recipientName } });
}
