/**
 * Shared look for the payment / documents choices (setup wizard step 3 and Settings): each group
 * is a rounded bordered box of tappable rows, nested options are indented with a side rule, and
 * each note is its own light info box below the group. Logical properties (ms / ps / border-s)
 * so Hebrew mirrors.
 */
export const CHOICE_LEGEND = 'mb-2 text-sm font-medium';
export const CHOICE_GROUP = 'rounded-xl border border-border divide-y divide-border bg-white';
export const CHOICE_ROW = 'flex cursor-pointer items-start gap-3 px-3 py-2 text-sm';
export const CHOICE_RADIO = 'mt-0.5 h-5 w-5 shrink-0 accent-primary';
export const CHOICE_NESTED = 'ms-8 border-s-2 border-border ps-3';
export const CHOICE_NOTE = 'mt-3 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700';
