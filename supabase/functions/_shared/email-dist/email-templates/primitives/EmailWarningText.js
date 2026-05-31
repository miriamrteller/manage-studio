import { jsx as _jsx } from "react/jsx-runtime";
import { Text } from '@react-email/components';
import { emailTypography } from './styles.js';
export function EmailWarningText({ children, style }) {
    return _jsx(Text, { style: { ...emailTypography.warning, ...style }, children: children });
}
