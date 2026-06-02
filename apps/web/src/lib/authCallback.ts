import type { EmailOtpType, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type AuthCallbackResult =
  | { ok: true }
  | { ok: false; message: string };

export type AuthCallbackUrlParts = {
  search: string;
  hash: string;
};

const AUTH_CALLBACK_STORAGE_KEY = 'manageStudio.authCallbackUrl';

function parseSearchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.replace(/^\?/, ''));
}

function parseHashParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ''));
}

function readAuthCallbackUrl(): AuthCallbackUrlParts {
  return {
    search: window.location.search,
    hash: window.location.hash,
  };
}

function persistAuthCallbackUrl(url: AuthCallbackUrlParts): void {
  if (!url.search && !url.hash) return;
  try {
    sessionStorage.setItem(AUTH_CALLBACK_STORAGE_KEY, JSON.stringify(url));
  } catch {
    // sessionStorage may be unavailable in some embedded browsers
  }
}

function readPersistedAuthCallbackUrl(): AuthCallbackUrlParts | null {
  try {
    const stored = sessionStorage.getItem(AUTH_CALLBACK_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as AuthCallbackUrlParts;
  } catch {
    return null;
  }
}

/** signInWithOtp emails use action type magiclink; verifyOtp expects type email. */
function resolveOtpVerifyType(type: string | null): EmailOtpType {
  if (type === 'magiclink') return 'email';
  const allowed: EmailOtpType[] = [
    'signup',
    'invite',
    'recovery',
    'email_change',
    'email',
  ];
  if (type && allowed.includes(type as EmailOtpType)) {
    return type as EmailOtpType;
  }
  return 'email';
}

function readAuthError(
  searchParams: URLSearchParams,
  hashParams: URLSearchParams,
): string | null {
  return (
    searchParams.get('error_description') ??
    searchParams.get('error') ??
    hashParams.get('error_description') ??
    hashParams.get('error')
  );
}

async function waitForAuthSession(timeoutMs = 4000): Promise<Session | null> {
  const existing = await supabase.auth.getSession();
  if (existing.data.session) {
    return existing.data.session;
  }

  return new Promise((resolve) => {
    let settled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const finish = (session: Session | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      subscription?.unsubscribe();
      resolve(session);
    };

    const timeoutId = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      finish(data.session);
    }, timeoutMs);

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        finish(session);
      }
    });
    subscription = authSubscription;
  });
}

/**
 * Completes login from /auth/callback after a magic link click.
 * Reads URL parts immediately so nothing else can strip ?code= first.
 */
export async function establishSessionFromAuthCallback(
  url: AuthCallbackUrlParts = readAuthCallbackUrl(),
): Promise<AuthCallbackResult> {
  const {
    data: { session: existingSession },
    error: existingSessionError,
  } = await supabase.auth.getSession();

  if (existingSessionError) {
    return { ok: false, message: existingSessionError.message };
  }

  if (existingSession) {
    return { ok: true };
  }

  const searchParams = parseSearchParams(url.search);
  const hashParams = parseHashParams(url.hash);
  const authError = readAuthError(searchParams, hashParams);

  if (authError) {
    return { ok: false, message: authError };
  }

  const code = searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  const tokenHash = searchParams.get('token_hash');
  if (tokenHash) {
    const otpType = resolveOtpVerifyType(searchParams.get('type'));
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  const session = await waitForAuthSession();
  if (session) {
    return { ok: true };
  }

  return { ok: false, message: 'invalid_callback' };
}

export function captureAuthCallbackUrl(): AuthCallbackUrlParts {
  const current = readAuthCallbackUrl();
  if (current.search || current.hash) {
    persistAuthCallbackUrl(current);
    return current;
  }
  return readPersistedAuthCallbackUrl() ?? current;
}

export function clearAuthCallbackUrl(): void {
  try {
    sessionStorage.removeItem(AUTH_CALLBACK_STORAGE_KEY);
  } catch {
    // ignore
  }
  window.history.replaceState({}, document.title, `${window.location.pathname}`);
}
