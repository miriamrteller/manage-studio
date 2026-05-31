import React from 'react';
import { Text } from '@react-email/components';
import { emailTypography } from './styles.js';

interface EmailParagraphProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function EmailParagraph({ children, style }: EmailParagraphProps) {
  return <Text style={{ ...emailTypography.body, ...style }}>{children}</Text>;
}
