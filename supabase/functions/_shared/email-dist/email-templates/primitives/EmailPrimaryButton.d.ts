import React from 'react';
interface EmailPrimaryButtonProps {
    href: string;
    children: React.ReactNode;
}
/**
 * With a brand gradient (auth emails): a bulletproof button. A table cell carries
 * the solid `bgcolor` (what Outlook and gradient-less clients show) plus the CSS
 * gradient, and the link inside fills it. White text is AA on the solid fill and
 * on the gradient end. Otherwise the flat primary-colour button.
 */
export declare function EmailPrimaryButton({ href, children }: EmailPrimaryButtonProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=EmailPrimaryButton.d.ts.map