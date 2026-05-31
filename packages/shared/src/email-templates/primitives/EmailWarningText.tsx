import React from 'react';
import { Text } from '@react-email/components';
import { emailTypography } from './styles.js';

interface EmailWarningTextProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function EmailWarningText({ children, style }: EmailWarningTextProps) {
  return <Text style={{ ...emailTypography.warning, ...style }}>{children}</Text>;
}
