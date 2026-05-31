import { jsx as _jsx } from "react/jsx-runtime";
import { Text } from '@react-email/components';
import { emailTypography } from './styles.js';
export function EmailParagraph({ children, style }) {
    return _jsx(Text, { style: { ...emailTypography.body, ...style }, children: children });
}
