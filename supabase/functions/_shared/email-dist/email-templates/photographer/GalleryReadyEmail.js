/* @ts-self-types="./GalleryReadyEmail.d.ts" */
import { jsx as _jsx } from "react/jsx-runtime";
import ShootEmailLayout from './ShootEmailLayout.js';
const DEFAULTS = {
    preview: 'Your gallery from {schoolName} is ready',
    greeting: 'Dear {recipientName},',
    body: 'Your photos are ready! Open your gallery to choose your photos.',
    cta: 'Open your gallery',
    closing: 'We hope you love the photos.',
};
export default function GalleryReadyEmail(props) {
    const { recipientName, galleryUrl, ...common } = props;
    return (_jsx(ShootEmailLayout, { ...common, defaults: DEFAULTS, values: { recipientName }, ctaHref: galleryUrl }));
}
