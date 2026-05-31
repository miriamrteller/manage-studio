/** Shared inline style tokens for email primitives (email-client safe). */
export declare const emailTypography: {
    body: {
        readonly fontSize: "16px";
        readonly lineHeight: "1.6";
        readonly color: "var(--email-text)";
        readonly margin: "0 0 16px 0";
    };
    muted: {
        readonly fontSize: "14px";
        readonly lineHeight: "1.5";
        readonly color: "var(--email-neutral)";
        readonly margin: "0 0 12px 0";
    };
    warning: {
        readonly fontSize: "14px";
        readonly lineHeight: "1.5";
        readonly color: "var(--email-accent)";
        readonly margin: "0 0 16px 0";
    };
    heading: {
        fontSize: string;
        fontWeight: "600";
        color: string;
        margin: string;
    };
};
export declare const emailButtonPrimary: {
    readonly backgroundColor: "var(--email-primary)";
    readonly color: "#ffffff";
    readonly padding: "14px 36px";
    readonly borderRadius: "8px";
    readonly textDecoration: "none";
    readonly display: "inline-block";
    readonly fontWeight: "600";
    readonly fontSize: "16px";
};
export declare const emailCodeBox: {
    wrapper: {
        backgroundColor: string;
        color: string;
        padding: string;
        borderRadius: string;
        textAlign: "center";
        marginBottom: string;
    };
    label: {
        fontSize: string;
        margin: string;
        opacity: string;
        textTransform: "uppercase";
        letterSpacing: string;
        color: string;
    };
    digits: {
        fontSize: string;
        fontWeight: "bold";
        letterSpacing: string;
        fontFamily: string;
        margin: string;
        color: string;
    };
    digitsCompact: {
        fontSize: string;
        fontWeight: "bold";
        letterSpacing: string;
        fontFamily: string;
        margin: string;
        color: string;
        whiteSpace: "nowrap";
    };
    plainFallback: {
        backgroundColor: string;
        padding: string;
        borderRadius: string;
        marginBottom: string;
        textAlign: "center";
        fontFamily: string;
        fontSize: string;
        fontWeight: "bold";
        color: string;
    };
};
export declare const emailCodeCopyPanel: {
    panel: (primaryColor: string) => {
        readonly border: `2px solid ${string}`;
        readonly borderRadius: "8px";
        readonly padding: "14px 10px";
        readonly textAlign: "center";
        readonly backgroundColor: "#ffffff";
    };
    label: (primaryColor: string) => {
        readonly fontSize: "12px";
        readonly fontWeight: "600";
        readonly margin: "0 0 6px 0";
        readonly color: string;
        readonly textTransform: "uppercase";
        readonly letterSpacing: "0.5px";
    };
    code: {
        readonly fontSize: "18px";
        readonly fontWeight: "bold";
        readonly fontFamily: "\"Courier New\", monospace";
        readonly margin: "0";
        readonly color: "#1f2937";
        readonly letterSpacing: "1px";
        readonly WebkitUserSelect: "all";
        readonly userSelect: "all";
    };
};
export declare const emailLinkBox: {
    backgroundColor: string;
    padding: string;
    borderRadius: string;
    marginBottom: string;
    wordBreak: "break-all";
};
//# sourceMappingURL=styles.d.ts.map