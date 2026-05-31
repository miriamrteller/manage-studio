import React from 'react';
import { Column, Row, Text } from '@react-email/components';
import { emailCodeBox, emailCodeCopyPanel } from './styles.js';

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
export function EmailCodeWithCopy({
  code,
  copyLabel,
  primaryColor = '#2563eb',
}: EmailCodeWithCopyProps) {
  return (
    <Row style={{ marginBottom: '24px' }}>
      <Column style={{ width: '68%', paddingRight: '10px', verticalAlign: 'middle' }}>
        <div style={{ ...emailCodeBox.wrapper, marginBottom: 0 }}>
          <Text style={emailCodeBox.digitsCompact}>{code}</Text>
        </div>
      </Column>
      <Column style={{ width: '32%', verticalAlign: 'middle' }}>
        <div style={emailCodeCopyPanel.panel(primaryColor)}>
          <Text style={emailCodeCopyPanel.label(primaryColor)}>{copyLabel}</Text>
          <Text style={emailCodeCopyPanel.code}>{code}</Text>
        </div>
      </Column>
    </Row>
  );
}
