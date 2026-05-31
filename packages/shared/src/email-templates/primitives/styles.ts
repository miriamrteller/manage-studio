/** Shared inline style tokens for email primitives (email-client safe). */

export const emailTypography = {
  body: {
    fontSize: '16px',
    lineHeight: '1.6',
    color: 'var(--email-text)',
    margin: '0 0 16px 0',
  } as const,
  muted: {
    fontSize: '14px',
    lineHeight: '1.5',
    color: 'var(--email-neutral)',
    margin: '0 0 12px 0',
  } as const,
  warning: {
    fontSize: '14px',
    lineHeight: '1.5',
    color: 'var(--email-accent)',
    margin: '0 0 16px 0',
  } as const,
  heading: {
    fontSize: '20px',
    fontWeight: '600' as const,
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
} as const;

export const emailCodeBox = {
  wrapper: {
    backgroundColor: 'var(--email-primary)',
    color: '#ffffff',
    padding: '28px 24px',
    borderRadius: '8px',
    textAlign: 'center' as const,
    marginBottom: '24px',
  },
  label: {
    fontSize: '12px',
    margin: '0 0 12px 0',
    opacity: '0.9',
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
    color: '#ffffff',
  },
  digits: {
    fontSize: '42px',
    fontWeight: 'bold' as const,
    letterSpacing: '8px',
    fontFamily: '"Courier New", monospace',
    margin: '0',
    color: '#ffffff',
  },
  digitsCompact: {
    fontSize: '36px',
    fontWeight: 'bold' as const,
    letterSpacing: '4px',
    fontFamily: '"Courier New", monospace',
    margin: '0',
    color: '#ffffff',
    whiteSpace: 'nowrap' as const,
  },
  plainFallback: {
    backgroundColor: '#f3f4f6',
    padding: '14px',
    borderRadius: '6px',
    marginBottom: '20px',
    textAlign: 'center' as const,
    fontFamily: '"Courier New", monospace',
    fontSize: '18px',
    fontWeight: 'bold' as const,
    color: 'var(--email-text)',
  },
};

export const emailCodeCopyPanel = {
  panel: (primaryColor: string) =>
    ({
      border: `2px solid ${primaryColor}`,
      borderRadius: '8px',
      padding: '14px 10px',
      textAlign: 'center' as const,
      backgroundColor: '#ffffff',
    }) as const,
  label: (primaryColor: string) =>
    ({
      fontSize: '12px',
      fontWeight: '600' as const,
      margin: '0 0 6px 0',
      color: primaryColor,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
    }) as const,
  code: {
    fontSize: '18px',
    fontWeight: 'bold' as const,
    fontFamily: '"Courier New", monospace',
    margin: '0',
    color: '#1f2937',
    letterSpacing: '1px',
    WebkitUserSelect: 'all' as const,
    userSelect: 'all' as const,
  } as const,
};

export const emailLinkBox = {
  backgroundColor: '#f3f4f6',
  padding: '12px 14px',
  borderRadius: '6px',
  marginBottom: '20px',
  wordBreak: 'break-all' as const,
};
