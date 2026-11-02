import React from 'react';
import { Text } from '@react-email/components';
import { emailTypography } from './styles.js';
import { useEmailBrand } from './brand.js';

interface EmailWarningTextProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function EmailWarningText({ children, style }: EmailWarningTextProps) {
  // Gradient (auth) emails: a fixed amber that is AA on white (5.0:1); a studio's
  // accent (teal, pink...) as text would not be.
  const brand = useEmailBrand();
  const colour = brand ? { color: '#b45309' } : {};
  return <Text style={{ ...emailTypography.warning, ...colour, ...style }}>{children}</Text>;
}
