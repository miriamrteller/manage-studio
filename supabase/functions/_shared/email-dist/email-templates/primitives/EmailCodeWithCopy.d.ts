interface EmailCodeWithCopyProps {
    code: string;
    copyLabel: string;
    /** Resolved primary hex (email clients ignore CSS variables on buttons). */
    primaryColor?: string;
}
/**

 * Sign-in code with a copy-friendly panel beside it.

 * Email clients cannot run clipboard JS; the right panel uses selectable monospace text.

 */
export declare function EmailCodeWithCopy({ code, copyLabel, primaryColor, }: EmailCodeWithCopyProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=EmailCodeWithCopy.d.ts.map