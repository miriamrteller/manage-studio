import { type ShootEmailCommonProps } from './ShootEmailLayout.js';
export interface BookingConfirmedEmailProps extends ShootEmailCommonProps {
    recipientName: string;
    shootDate: string;
    totalFormatted: string;
    depositFormatted: string;
    balanceFormatted: string;
    balanceDueDate: string;
    quoteUrl: string;
    /** Step 1: contract signing link (omit when there is no contract to sign). */
    signUrl?: string;
    /** Step 2: deposit pay link (omit when there is no unpaid deposit). */
    payUrl?: string;
}
export default function BookingConfirmedEmail(props: BookingConfirmedEmailProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=BookingConfirmedEmail.d.ts.map