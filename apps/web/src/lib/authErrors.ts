/**
 * Maps Supabase Auth error messages to user-facing i18n keys.
 * Used by login, signup, and auth callback flows.
 */

export type AuthErrorCategory =
  | 'user_not_found'
  | 'email_delivery_failed'
  | 'rate_limited'
  | 'expired_link'
  | 'invalid_code'
  | 'redirect_mismatch'
  | 'invalid_callback'
  | 'session_exchange_failed'
  | 'generic';

const USER_NOT_FOUND_PATTERNS = [
  'user not found',
  'signups not allowed',
  'database error saving new user',
];

const EMAIL_DELIVERY_PATTERNS = [
  'error sending magic link email',
  'error sending confirmation email',
  'error sending email',
  'email provider',
  'smtp',
  'mailer',
  'failed to send',
];

const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'too many requests',
  'email rate limit',
  '429',
];

const EXPIRED_LINK_PATTERNS = [
  'otp expired',
  'link is invalid or has expired',
  'invalid or expired',
  'link has expired',
  'token has expired',
  'one-time token not found',
];

const INVALID_OTP_PATTERNS = [
  'invalid otp',
  'otp is invalid',
  'token is invalid',
  'invalid token',
  'wrong otp',
];

const REDIRECT_MISMATCH_PATTERNS = [
  'redirect_uri',
  'url not allowed',
  'invalid redirect',
  'redirect url',
];

const INVALID_CALLBACK_PATTERNS = [
  'invalid callback',
  'auth code',
  'authorization code',
  'code verifier',
];

const SESSION_EXCHANGE_PATTERNS = [
  'session exchange',
  'exchange code',
  'invalid grant',
];

export function classifyAuthError(message: string): AuthErrorCategory {
  const normalized = message.toLowerCase().trim();
  if (!normalized) return 'generic';

  if (USER_NOT_FOUND_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'user_not_found';
  }
  if (EMAIL_DELIVERY_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'email_delivery_failed';
  }
  if (RATE_LIMIT_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'rate_limited';
  }
  if (EXPIRED_LINK_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'expired_link';
  }
  if (INVALID_OTP_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'invalid_code';
  }
  if (REDIRECT_MISMATCH_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'redirect_mismatch';
  }
  if (INVALID_CALLBACK_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'invalid_callback';
  }
  if (SESSION_EXCHANGE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'session_exchange_failed';
  }

  return 'generic';
}

export type TranslateFn = (key: string) => string;

const CATEGORY_I18N_KEYS: Record<Exclude<AuthErrorCategory, 'generic'>, string> = {
  user_not_found: 'errors.user_not_found',
  email_delivery_failed: 'errors.email_delivery_failed',
  rate_limited: 'errors.rate_limited',
  expired_link: 'errors.expired_link',
  invalid_code: 'pages.login.invalid_code',
  redirect_mismatch: 'errors.redirect_mismatch',
  invalid_callback: 'errors.invalid_callback',
  session_exchange_failed: 'errors.session_exchange_failed',
};

export function resolveAuthErrorMessage(
  message: string,
  t: TranslateFn,
  fallbackKey: string = 'errors.login_failed',
): string {
  const category = classifyAuthError(message);

  if (category !== 'generic') {
    return t(CATEGORY_I18N_KEYS[category]);
  }

  return message.trim() || t(fallbackKey);
}

export function isMagicLinkUserNotFoundError(message: string): boolean {
  return classifyAuthError(message) === 'user_not_found';
}
