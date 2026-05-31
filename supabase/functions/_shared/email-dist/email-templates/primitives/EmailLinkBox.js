import { jsx as _jsx } from "react/jsx-runtime";
import { Link } from '@react-email/components';
import { emailLinkBox } from './styles.js';
export function EmailLinkBox({ href, children }) {
    return (_jsx("div", { style: emailLinkBox, children: _jsx(Link, { href: href, style: {
                color: 'var(--email-primary)',
                textDecoration: 'underline',
                fontSize: '12px',
            }, children: children ?? href }) }));
}
