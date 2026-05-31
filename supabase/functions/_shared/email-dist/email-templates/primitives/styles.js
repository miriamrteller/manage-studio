/** Shared inline style tokens for email primitives (email-client safe). */
export const emailTypography = {
    body: {
        fontSize: '16px',
        lineHeight: '1.6',
        color: 'var(--email-text)',
        margin: '0 0 16px 0',
    },
    muted: {
        fontSize: '14px',
        lineHeight: '1.5',
        color: 'var(--email-neutral)',
        margin: '0 0 12px 0',
    },
    warning: {
        fontSize: '14px',
        lineHeight: '1.5',
        color: 'var(--email-accent)',
        margin: '0 0 16px 0',
    },
    heading: {
        fontSize: '20px',
        fontWeight: '600',
        color: 'var(--email-text)',
        margin: '0 0 16px 0',
    },
};
export const emailButtonPrimary = {
    backgroundColor: 'var(--email-primary)',
    color: '#ffffff',
    padding: '14px 36px',
    borderRadius: '8px',
    textDecoration: 'none',
    display: 'inline-block',
    fontWeight: '600',
    fontSize: '16px',
};
export const emailCodeBox = {
    wrapper: {
        backgroundColor: 'var(--email-primary)',
        color: '#ffffff',
        padding: '28px 24px',
        borderRadius: '8px',
        textAlign: 'center',
        marginBottom: '24px',
    },
    label: {
        fontSize: '12px',
        margin: '0 0 12px 0',
        opacity: '0.9',
        textTransform: 'uppercase',
        letterSpacing: '2px',
        color: '#ffffff',
    },
    digits: {
        fontSize: '42px',
        fontWeight: 'bold',
        letterSpacing: '8px',
        fontFamily: '"Courier New", monospace',
        margin: '0',
        color: '#ffffff',
    },
    digitsCompact: {
        fontSize: '36px',
        fontWeight: 'bold',
        letterSpacing: '4px',
        fontFamily: '"Courier New", monospace',
        margin: '0',
        color: '#ffffff',
        whiteSpace: 'nowrap',
    },
    plainFallback: {
        backgroundColor: '#f3f4f6',
        padding: '14px',
        borderRadius: '6px',
        marginBottom: '20px',
        textAlign: 'center',
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        fontWeight: 'bold',
        color: 'var(--email-text)',
    },
};
export const emailCodeCopyPanel = {
    panel: (primaryColor) => ({
        border: `2px solid ${primaryColor}`,
        borderRadius: '8px',
        padding: '14px 10px',
        textAlign: 'center',
        backgroundColor: '#ffffff',
    }),
    label: (primaryColor) => ({
        fontSize: '12px',
        fontWeight: '600',
        margin: '0 0 6px 0',
        color: primaryColor,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    }),
    code: {
        fontSize: '18px',
        fontWeight: 'bold',
        fontFamily: '"Courier New", monospace',
        margin: '0',
        color: '#1f2937',
        letterSpacing: '1px',
        WebkitUserSelect: 'all',
        userSelect: 'all',
    },
};
export const emailLinkBox = {
    backgroundColor: '#f3f4f6',
    padding: '12px 14px',
    borderRadius: '6px',
    marginBottom: '20px',
    wordBreak: 'break-all',
};
