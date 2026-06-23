import { interpolateTemplate } from '../i18n/email.js';
function str(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
/**
 * Localized payment method label for confirmation emails.
 */
export function formatPaymentMethodDisplay(input) {
    const method = str(input.method, 'other').toLowerCase();
    const s = input.strings;
    if (method === 'card') {
        const brand = str(input.cardBrand, 'Card');
        const last4 = str(input.last4);
        const template = str(s.payment_method_card, '{brand} ending in {last4}');
        return last4
            ? interpolateTemplate(template, { brand, last4 })
            : brand;
    }
    const keyMap = {
        cash: 'payment_method_cash',
        bank_transfer: 'payment_method_bank_transfer',
        check: 'payment_method_check',
        other: 'payment_method_other',
    };
    const stringKey = keyMap[method] ?? 'payment_method_other';
    return str(s[stringKey], method);
}
