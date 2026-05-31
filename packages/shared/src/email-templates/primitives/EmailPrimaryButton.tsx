import React from 'react';
import { Button } from '@react-email/components';
import { emailButtonPrimary } from './styles.js';

interface EmailPrimaryButtonProps {
  href: string;
  children: React.ReactNode;
}

export function EmailPrimaryButton({ href, children }: EmailPrimaryButtonProps) {
  return (
    <div style={{ marginBottom: '28px', textAlign: 'center' }}>
      <Button href={href} style={emailButtonPrimary}>
        {children}
      </Button>
    </div>
  );
}
