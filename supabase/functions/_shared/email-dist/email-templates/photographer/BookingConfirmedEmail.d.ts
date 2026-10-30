import { type ShootEmailCommonProps } from './ShootEmailLayout.js';
export interface BookingConfirmedEmailProps extends ShootEmailCommonProps {
    recipientName: string;
    shootDate: string;
    totalFormatted: string;
    depositFormatted: string;
    balanceFormatted: string;
    balanceDueDate: string;
    quoteUrl: string;
}
export default function BookingConfirmedEmail(props: BookingConfirmedEmailProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=BookingConfirmedEmail.d.ts.map