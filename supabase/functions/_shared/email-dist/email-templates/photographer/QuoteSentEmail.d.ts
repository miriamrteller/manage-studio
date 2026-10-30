import { type ShootEmailCommonProps } from './ShootEmailLayout.js';
export interface QuoteSentEmailProps extends ShootEmailCommonProps {
    recipientName: string;
    quoteUrl: string;
    totalFormatted: string;
    validUntil: string;
    shootDate: string;
}
export default function QuoteSentEmail(props: QuoteSentEmailProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=QuoteSentEmail.d.ts.map