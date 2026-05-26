// Phone validation regex
export const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;
export const ISRAELI_PHONE_REGEX = /^05\d{8}$/;

// Timezone
export const TIMEZONE = 'Asia/Jerusalem';

// Date formats
export const DATE_FORMAT = 'dd/MM/yyyy';
export const DATETIME_FORMAT = 'dd/MM/yyyy HH:mm';

// Status enums
export const PERSON_STATUSES = ['active', 'inactive', 'withdrawn'] as const;
export const BILLING_STATUSES = ['active', 'inactive', 'archived'] as const;
export const TERM_STATUSES = ['upcoming', 'active', 'completed', 'archived'] as const;
export const REQUIREMENT_TYPES = [
  'gender',
  'level',
  'document_submitted',
  'manual_review',
] as const;
export const PAYMENT_METHODS = ['card', 'bank_transfer', 'cash', 'check'] as const;

// Debounce delays (ms)
export const DEBOUNCE_DELAYS = {
  SEARCH: 300,
  FORM: 500,
  RESIZE: 200,
} as const;
