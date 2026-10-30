import { type ShootEmailCommonProps } from './ShootEmailLayout.js';
export interface ShootReminderEmailProps extends ShootEmailCommonProps {
    recipientName: string;
    shootDate: string;
    shootTime: string;
    location: string;
}
export default function ShootReminderEmail(props: ShootReminderEmailProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=ShootReminderEmail.d.ts.map