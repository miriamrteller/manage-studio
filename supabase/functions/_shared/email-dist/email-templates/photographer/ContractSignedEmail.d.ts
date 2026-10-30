import { type ShootEmailCommonProps } from './ShootEmailLayout.js';
/** Client copy of the signed shoot contract (PDF attached or linked). */
export interface ContractSignedEmailProps extends ShootEmailCommonProps {
    recipientName: string;
    shootDate: string;
    packageName: string;
    signedAt: string;
    downloadUrl: string;
}
export default function ContractSignedEmail(props: ContractSignedEmailProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=ContractSignedEmail.d.ts.map