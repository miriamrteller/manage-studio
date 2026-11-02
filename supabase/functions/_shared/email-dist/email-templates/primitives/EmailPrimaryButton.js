/* @ts-self-types="./EmailPrimaryButton.d.ts" */
import { jsx as _jsx } from "react/jsx-runtime";
import { Button } from '@react-email/components';
import { emailButtonPrimary } from './styles.js';
import { emailGradient } from '../../email/brand.js';
import { useEmailBrand } from './brand.js';
/**
 * With a brand gradient (auth emails): a bulletproof button. A table cell carries
 * the solid `bgcolor` (what Outlook and gradient-less clients show) plus the CSS
 * gradient, and the link inside fills it. White text is AA on the solid fill and
 * on the gradient end. Otherwise the flat primary-colour button.
 */
export function EmailPrimaryButton({ href, children }) {
    const brand = useEmailBrand();
    if (brand) {
        return (_jsx("table", { role: "presentation", cellPadding: 0, cellSpacing: 0, border: 0, align: "center", style: { margin: '0 auto 28px', borderCollapse: 'separate' }, children: _jsx("tbody", { children: _jsx("tr", { children: _jsx("td", { align: "center", 
                        // @ts-expect-error legacy attribute, kept for Outlook
                        bgcolor: brand.fill, style: {
                            backgroundColor: brand.fill,
                            backgroundImage: emailGradient(brand),
                            borderRadius: '8px',
                        }, children: _jsx("a", { href: href, style: {
                                display: 'inline-block',
                                padding: '14px 36px',
                                color: '#ffffff',
                                fontWeight: 600,
                                fontSize: '16px',
                                lineHeight: '1.2',
                                textDecoration: 'none',
                                borderRadius: '8px',
                            }, children: children }) }) }) }) }));
    }
    return (_jsx("div", { style: { marginBottom: '28px', textAlign: 'center' }, children: _jsx(Button, { href: href, style: emailButtonPrimary, children: children }) }));
}
