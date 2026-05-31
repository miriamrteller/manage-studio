import { jsx as _jsx } from "react/jsx-runtime";
import { Text } from '@react-email/components';
import { emailTypography } from './styles.js';
export function EmailMutedText({ children, style }) {
    return _jsx(Text, { style: { ...emailTypography.muted, ...style }, children: children });
}
