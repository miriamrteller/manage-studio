/** Extract hex from `var(--token, #hex)` for email clients that ignore CSS variables. */
function resolveColor(value, fallback) {
    const varMatch = value.match(/var\([^,]+,\s*([^)]+)\)/);
    if (varMatch) {
        return varMatch[1].trim();
    }
    if (value.startsWith('var(')) {
        return fallback;
    }
    return value;
}
export function normalizeEmailColors(colors) {
    const defaults = {
        primary: '#2563eb',
        accent: '#dc2626',
        text: '#1f2937',
        bg: '#ffffff',
        neutral: '#6b7280',
    };
    if (!colors) {
        return defaults;
    }
    return {
        primary: resolveColor(colors.primary, defaults.primary),
        accent: resolveColor(colors.accent, defaults.accent),
        text: resolveColor(colors.text, defaults.text),
        bg: resolveColor(colors.bg, defaults.bg),
        neutral: resolveColor(colors.neutral, defaults.neutral),
    };
}
