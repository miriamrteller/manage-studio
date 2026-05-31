import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Text } from '@react-email/components';
import { emailCodeBox } from './styles.js';
export function EmailCodeBox({ code, label, showPlainFallback = true, spaced = true, }) {
    const displayCode = spaced ? code.split('').join(' ') : code;
    return (_jsxs(_Fragment, { children: [_jsxs("div", { style: emailCodeBox.wrapper, children: [label ? (_jsx(Text, { style: emailCodeBox.label, children: label })) : null, _jsx(Text, { style: spaced ? emailCodeBox.digits : emailCodeBox.digitsCompact, children: displayCode })] }), showPlainFallback ? (_jsx("div", { style: emailCodeBox.plainFallback, children: code })) : null] }));
}
