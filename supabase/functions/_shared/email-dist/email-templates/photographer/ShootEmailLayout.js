/* @ts-self-types="./ShootEmailLayout.d.ts" */
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import BaseEmailTemplate from '../BaseEmailTemplate.js';
import { EmailDetailsTable, EmailMutedText, EmailParagraph, EmailPrimaryButton } from '../primitives/index.js';
import { interpolateTemplate } from '../../i18n/email.js';
function pick(strings, defaults, key) {
    const value = strings?.[key];
    return typeof value === 'string' ? value : defaults[key] ?? '';
}
export default function ShootEmailLayout({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, defaults, values, rows = [], ctaHref, bodyKey = 'body', steps = [], }) {
    const vars = { schoolName, ...values };
    const s = (key) => interpolateTemplate(pick(strings, defaults, key), vars);
    return (_jsxs(BaseEmailTemplate, { previewText: s('preview'), schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, footerStrings: footerStrings, children: [_jsx(EmailParagraph, { children: s('greeting') }), _jsx(EmailParagraph, { children: s(bodyKey) }), steps.map((step, index) => (_jsxs(React.Fragment, { children: [_jsx(EmailParagraph, { children: `${index + 1}. ${s(step.textKey)}` }), _jsx(EmailPrimaryButton, { href: step.href, children: s(step.ctaKey) })] }, step.textKey))), rows.length > 0 && (_jsx(EmailDetailsTable, { heading: s('details_heading'), rows: rows.map((row) => ({ label: s(row.labelKey), value: row.value })) })), ctaHref && _jsx(EmailPrimaryButton, { href: ctaHref, children: s('cta') }), _jsx(EmailMutedText, { children: s('closing') })] }));
}
