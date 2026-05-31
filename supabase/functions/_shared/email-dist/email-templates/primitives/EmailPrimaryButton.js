import { jsx as _jsx } from "react/jsx-runtime";
import { Button } from '@react-email/components';
import { emailButtonPrimary } from './styles.js';
export function EmailPrimaryButton({ href, children }) {
    return (_jsx("div", { style: { marginBottom: '28px', textAlign: 'center' }, children: _jsx(Button, { href: href, style: emailButtonPrimary, children: children }) }));
}
