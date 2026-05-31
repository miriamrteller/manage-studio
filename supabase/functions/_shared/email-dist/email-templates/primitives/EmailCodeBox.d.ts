interface EmailCodeBoxProps {
    code: string;
    label?: string;
    showPlainFallback?: boolean;
    /** Letter-space digits for display. Off for magic-link emails (avoids wrap in narrow clients). */
    spaced?: boolean;
}
export declare function EmailCodeBox({ code, label, showPlainFallback, spaced, }: EmailCodeBoxProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=EmailCodeBox.d.ts.map