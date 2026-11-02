import React from 'react';
import { Text } from '@react-email/components';
import { emailCodeBox } from './styles.js';
import { emailGradient } from '../../email/brand.js';
import { useEmailBrand } from './brand.js';

interface EmailOtpCodeProps {
  code: string;
}

/** Sign-in OTP code — single selectable block (no copy button; email clients cannot run clipboard JS). */
export function EmailOtpCode({ code }: EmailOtpCodeProps) {
  const brand = useEmailBrand();
  const wrapper = brand
    ? { ...emailCodeBox.wrapper, backgroundColor: brand.fill, backgroundImage: emailGradient(brand) }
    : emailCodeBox.wrapper;
  return (
    <div style={wrapper}>
      <Text style={emailCodeBox.digits}>{code}</Text>
    </div>
  );
}

/** @deprecated Use EmailOtpCode — kept for bundle compatibility during rename. */
export function EmailCodeWithCopy({ code }: { code: string; copyLabel?: string; primaryColor?: string }) {
  return <EmailOtpCode code={code} />;
}
