/* @ts-self-types="./ShootCancelledEmail.d.ts" */
import { jsx as _jsx } from "react/jsx-runtime";
import ShootEmailLayout from './ShootEmailLayout.js';
const DEFAULTS = {
    preview: 'Your shoot with {schoolName} is cancelled',
    greeting: 'Hi {recipientName},',
    body: 'Your shoot with us has been cancelled. Any payment links we sent you for it no longer work.',
    details_heading: 'Cancelled shoot',
    shoot_date_label: 'Date',
    shoot_time_label: 'Time',
    closing: 'Questions, or want to book another date? Just reply to this email.',
};
export default function ShootCancelledEmail(props) {
    const { recipientName, shootDate, shootTime, ...common } = props;
    return (_jsx(ShootEmailLayout, { ...common, defaults: DEFAULTS, values: { recipientName }, rows: [
            { labelKey: 'shoot_date_label', value: shootDate },
            { labelKey: 'shoot_time_label', value: shootTime },
        ] }));
}
