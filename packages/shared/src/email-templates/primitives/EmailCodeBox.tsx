import React from 'react';
import { Text } from '@react-email/components';
import { emailCodeBox } from './styles.js';

interface EmailCodeBoxProps {
  code: string;
  label?: string;
  showPlainFallback?: boolean;
  /** Letter-space digits for display. Off for magic-link emails (avoids wrap in narrow clients). */
  spaced?: boolean;
}

export function EmailCodeBox({
  code,
  label,
  showPlainFallback = true,
  spaced = true,
}: EmailCodeBoxProps) {
  const displayCode = spaced ? code.split('').join(' ') : code;

  return (
    <>
      <div style={emailCodeBox.wrapper}>
        {label ? (
          <Text style={emailCodeBox.label}>{label}</Text>
        ) : null}
        <Text style={spaced ? emailCodeBox.digits : emailCodeBox.digitsCompact}>
          {displayCode}
        </Text>
      </div>
      {showPlainFallback ? (
        <div style={emailCodeBox.plainFallback}>{code}</div>
      ) : null}
    </>
  );
}
