/* @ts-self-types="./EmailWarningText.d.ts" */
import { jsx as _jsx } from "react/jsx-runtime";
import { Text } from '@react-email/components';
import { emailTypography } from './styles.js';
import { useEmailBrand } from './brand.js';
export function EmailWarningText({ children, style }) {
    // Gradient (auth) emails: a fixed amber that is AA on white (5.0:1); a studio's
    // accent (teal, pink...) as text would not be.
    const brand = useEmailBrand();
    const colour = brand ? { color: '#b45309' } : {};
    return _jsx(Text, { style: { ...emailTypography.warning, ...colour, ...style }, children: children });
}
