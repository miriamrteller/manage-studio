interface EmailOtpCodeProps {
    code: string;
}
/** Sign-in OTP code — single selectable block (no copy button; email clients cannot run clipboard JS). */
export declare function EmailOtpCode({ code }: EmailOtpCodeProps): import("react/jsx-runtime").JSX.Element;
/** @deprecated Use EmailOtpCode — kept for bundle compatibility during rename. */
export declare function EmailCodeWithCopy({ code }: {
    code: string;
    copyLabel?: string;
    primaryColor?: string;
}): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=EmailCodeWithCopy.d.ts.map