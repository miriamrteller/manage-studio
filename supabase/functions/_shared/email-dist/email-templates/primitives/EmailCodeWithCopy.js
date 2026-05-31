import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Column, Row, Text } from '@react-email/components';
import { emailCodeBox, emailCodeCopyPanel } from './styles.js';
/**

 * Sign-in code with a copy-friendly panel beside it.

 * Email clients cannot run clipboard JS; the right panel uses selectable monospace text.

 */
export function EmailCodeWithCopy({ code, copyLabel, primaryColor = '#2563eb', }) {
    return (_jsxs(Row, { style: { marginBottom: '24px' }, children: [_jsx(Column, { style: { width: '68%', paddingRight: '10px', verticalAlign: 'middle' }, children: _jsx("div", { style: { ...emailCodeBox.wrapper, marginBottom: 0 }, children: _jsx(Text, { style: emailCodeBox.digitsCompact, children: code }) }) }), _jsx(Column, { style: { width: '32%', verticalAlign: 'middle' }, children: _jsxs("div", { style: emailCodeCopyPanel.panel(primaryColor), children: [_jsx(Text, { style: emailCodeCopyPanel.label(primaryColor), children: copyLabel }), _jsx(Text, { style: emailCodeCopyPanel.code, children: code })] }) })] }));
}
