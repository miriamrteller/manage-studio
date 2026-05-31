import React from 'react';
import { Text } from '@react-email/components';
import { emailTypography } from './styles.js';

interface EmailMutedTextProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function EmailMutedText({ children, style }: EmailMutedTextProps) {
  return <Text style={{ ...emailTypography.muted, ...style }}>{children}</Text>;
}
