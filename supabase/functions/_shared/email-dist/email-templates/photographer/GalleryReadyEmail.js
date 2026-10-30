/* @ts-self-types="./GalleryReadyEmail.d.ts" */
import { jsx as _jsx } from "react/jsx-runtime";
import ShootEmailLayout from './ShootEmailLayout.js';
const DEFAULTS = {
    preview: 'Your gallery from {schoolName} is ready',
    greeting: 'Hi {recipientName},',
    body: 'Your photos are ready! Open your gallery to view and download them.',
    cta: 'Open your gallery',
    closing: 'We hope you love them.',
};
export default function GalleryReadyEmail(props) {
    const { recipientName, galleryUrl, ...common } = props;
    return (_jsx(ShootEmailLayout, { ...common, defaults: DEFAULTS, values: { recipientName }, ctaHref: galleryUrl }));
}
