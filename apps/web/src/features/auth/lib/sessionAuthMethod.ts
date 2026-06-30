import type { Session } from '@supabase/supabase-js';

function decodeBase64UrlPart(part: string): string {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  return globalThis.atob(padded);
}

function decodeJwtPayload(accessToken: string): unknown {
  const part = accessToken.split('.')[1];
  if (!part) return null;
  return JSON.parse(decodeBase64UrlPart(part));
}

/** True when the active session was established with a password sign-in. */
export function sessionUsedPassword(session: Session | null): boolean {
  if (!session?.access_token) return false;

  try {
    const payload = decodeJwtPayload(session.access_token) as {
      amr?: Array<{ method?: string } | string>;
    };
    const methods = payload.amr ?? [];
    return methods.some((entry) => {
      const method = typeof entry === 'string' ? entry : entry.method;
      return method === 'pwd' || method === 'password';
    });
  } catch {
    return false;
  }
}
