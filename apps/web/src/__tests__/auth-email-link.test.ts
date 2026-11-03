/**
 * The sign-in button in an auth email must be ONE correct absolute URL: the studio's own
 * /auth/callback with token_hash and type, no doubled origin, nothing encoded. This renders the
 * real pre-built email (same code path as send-auth-email) for the redirect the login page sends.
 */
import { describe, expect, it } from 'vitest';
import { renderAuthMagicLinkHtml } from '../../../../supabase/functions/_shared/render-auth-email.ts';

const ORIGIN = 'https://creativeballet.opalswift.com';

/** Same steps as send-auth-email's buildConfirmationUrl. */
function confirmationUrl(redirectTo: string, tokenHash: string, type: string): string {
  const url = new URL(redirectTo);
  url.searchParams.delete('login_method');
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', type);
  return url.toString();
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}

/** The visible "copy this link" text (what the owner could paste successfully). */
function visibleLinkText(html: string): string {
  const m = html.match(/<a href="[^"]*token_hash[^"]*"[^>]*target="_blank">([^<]*)<\/a>/);
  return (m?.[1] ?? '').replace(/&amp;/g, '&');
}

describe('auth email sign-in link', () => {
  for (const [name, redirectTo, type] of [
    ['magic link', `${ORIGIN}/auth/callback?login_method=magic_link`, 'magiclink'],
    ['email code tab', `${ORIGIN}/auth/callback?login_method=code`, 'magiclink'],
    ['recovery', `${ORIGIN}/auth/callback`, 'recovery'],
    ['invite', `${ORIGIN}/auth/callback`, 'invite'],
    ['email change', `${ORIGIN}/auth/callback`, 'email_change'],
    ['waiver sign-in', `${ORIGIN}/auth/callback?pendingWaiverEngagementId=abc-123`, 'magiclink'],
  ] as const) {
    it(`${name}: both links in the email are the single callback URL`, () => {
      const link = confirmationUrl(redirectTo, 'pkce_0123abcd', type);
      const html = renderAuthMagicLinkHtml({
        language: 'en', schoolName: 'Creative Ballet', magicLinkUrl: link, otpCode: '123456',
        primaryColor: '#123456', accentColor: '#654321',
      });
      // The button's href is exactly the link shown as text under it.
      expect(hrefs(html).find((h) => h.includes('token_hash'))).toBe(visibleLinkText(html));
      const own = hrefs(html).filter((h) => h.includes('token_hash'));
      expect(own).toHaveLength(2); // the button and the "copy this link" line
      for (const h of own) {
        expect(h).toBe(link);
        expect(h.startsWith(`${ORIGIN}/auth/callback?`)).toBe(true);
        expect(h.split('https://')).toHaveLength(2); // the origin appears once
        expect(h).not.toMatch(/%3A|%2F/i);
        const u = new URL(h);
        expect(u.searchParams.get('token_hash')).toBe('pkce_0123abcd');
        expect(u.searchParams.get('type')).toBe(type);
        expect(u.searchParams.has('login_method')).toBe(false);
      }
    });
  }
});
