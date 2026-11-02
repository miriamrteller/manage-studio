import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TurnstileWidget } from './TurnstileWidget';

/**
 * Cloudflare Turnstile site key. When unset, no CAPTCHA is shown and auth calls
 * send no token (Supabase CAPTCHA must then stay off).
 */
export function turnstileSiteKey(): string | null {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  return key ? key : null;
}

export interface Captcha {
  /** The check to render near the submit button; null when CAPTCHA is off. */
  widget: ReactNode;
  /** False while a check is shown and not yet passed. */
  ready: boolean;
  /** Fields to add to a Supabase auth call's `options`. */
  authOptions(): { captchaToken?: string };
  /** The raw token (for our own Edge Functions), or null. */
  token: string | null;
  /** A token works once: call after each auth request to get a fresh check. */
  reset(): void;
}

/**
 * CAPTCHA for Supabase auth calls (sign-in, sign-up, codes, password checks).
 * Supabase Attack Protection requires a token on those calls once it is on.
 */
export function useCaptcha(): Captcha {
  const { i18n } = useTranslation();
  const siteKey = turnstileSiteKey();
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const reset = useCallback(() => {
    setToken(null);
    setRound((r) => r + 1);
  }, []);

  const widget = siteKey ? (
    <TurnstileWidget
      key={round}
      siteKey={siteKey}
      language={i18n.language?.startsWith('he') ? 'he' : 'en'}
      onToken={setToken}
    />
  ) : null;

  return {
    widget,
    ready: !siteKey || Boolean(token),
    token,
    authOptions: () => (token ? { captchaToken: token } : {}),
    reset,
  };
}
