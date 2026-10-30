import { type ShootEmailCommonProps } from './ShootEmailLayout.js';
/** Photographer's copy: a client signed their shoot contract. */
export interface ContractSignedStudioEmailProps extends ShootEmailCommonProps {
    clientName: string;
    shootDate: string;
    packageName: string;
    signedAt: string;
    downloadUrl: string;
}
export default function ContractSignedStudioEmail(props: ContractSignedStudioEmailProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=ContractSignedStudioEmail.d.ts.map