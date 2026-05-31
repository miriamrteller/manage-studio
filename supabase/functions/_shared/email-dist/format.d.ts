/**
 * Time formatting for HH:MM strings with locale support
 */
export declare function formatTime(time: string, locale?: string): string;
/**
 * Currency formatting — always use this, never inline Intl calls
 * Always in minor currency units (agorot for ILS)
 */
export declare function formatCurrency(amountMinor: number, currency?: string, locale?: string): string;
/**
 * Date formatting with locale support
 * Always specify Asia/Jerusalem timezone
 */
export declare function formatDate(date: Date | string, locale?: string, options?: Intl.DateTimeFormatOptions): string;
/**
 * Israeli phone number formatting
 * Ensures +972 prefix format
 */
export declare function formatPhone(phone: string): string;
//# sourceMappingURL=format.d.ts.map