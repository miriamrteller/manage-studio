import { jsx as _jsx } from "react/jsx-runtime";
import { Text } from '@react-email/components';
import { emailCodeBox } from './styles.js';
/** Sign-in OTP code — single selectable block (no copy button; email clients cannot run clipboard JS). */
export function EmailOtpCode({ code }) {
    return (_jsx("div", { style: emailCodeBox.wrapper, children: _jsx(Text, { style: emailCodeBox.digits, children: code }) }));
}
/** @deprecated Use EmailOtpCode — kept for bundle compatibility during rename. */
export function EmailCodeWithCopy({ code }) {
    return _jsx(EmailOtpCode, { code: code });
}
