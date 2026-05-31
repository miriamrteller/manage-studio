import React from 'react';
import { Link } from '@react-email/components';
import { emailLinkBox } from './styles.js';

interface EmailLinkBoxProps {
  href: string;
  children?: React.ReactNode;
}

export function EmailLinkBox({ href, children }: EmailLinkBoxProps) {
  return (
    <div style={emailLinkBox}>
      <Link
        href={href}
        style={{
          color: 'var(--email-primary)',
          textDecoration: 'underline',
          fontSize: '12px',
        }}
      >
        {children ?? href}
      </Link>
    </div>
  );
}
