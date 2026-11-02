/* @ts-self-types="./EmailCodeWithCopy.d.ts" */
import { jsx as _jsx } from "react/jsx-runtime";
import { Text } from '@react-email/components';
import { emailCodeBox } from './styles.js';
import { emailGradient } from '../../email/brand.js';
import { useEmailBrand } from './brand.js';
/** Sign-in OTP code — single selectable block (no copy button; email clients cannot run clipboard JS). */
export function EmailOtpCode({ code }) {
    const brand = useEmailBrand();
    const wrapper = brand
        ? { ...emailCodeBox.wrapper, backgroundColor: brand.fill, backgroundImage: emailGradient(brand) }
        : emailCodeBox.wrapper;
    return (_jsx("div", { style: wrapper, children: _jsx(Text, { style: emailCodeBox.digits, children: code }) }));
}
/** @deprecated Use EmailOtpCode — kept for bundle compatibility during rename. */
export function EmailCodeWithCopy({ code }) {
    return _jsx(EmailOtpCode, { code: code });
}
