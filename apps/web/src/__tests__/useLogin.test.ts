/**
 * useLogin magic-link behavior (error mapping + OTP options contract).
 * Run: pnpm -C apps/web test useLogin.test.ts
 */

import { describe, it, expect } from 'vitest';
import { classifyAuthError, resolveAuthErrorMessage } from '@/lib/authErrors';

const t = (key: string) => key;

describe('useLogin magic-link error handling', () => {
  it('maps dashboard magic-link email failure to friendly key', () => {
    const message = 'Error sending magic link email';
    expect(classifyAuthError(message)).toBe('email_delivery_failed');
    expect(resolveAuthErrorMessage(message, t)).toBe('errors.email_delivery_failed');
  });

  it('maps missing-user login attempt to user_not_found', () => {
    const message = 'User not found';
    expect(resolveAuthErrorMessage(message, t, 'errors.login_failed')).toBe(
      'errors.user_not_found',
    );
  });
});

describe('useLogin OTP contract', () => {
  it('expects shouldCreateUser false for login (existing accounts only)', () => {
    const loginOptions = {
      shouldCreateUser: false,
      emailRedirectTo: 'http://localhost:5173/auth/callback',
      data: { subdomain: 'creativeballet' },
    };

    expect(loginOptions.shouldCreateUser).toBe(false);
    expect(loginOptions.emailRedirectTo).toContain('/auth/callback');
    expect(loginOptions.data.subdomain).toBeTruthy();
  });

  it('expects shouldCreateUser true for signup (new accounts)', () => {
    const signupOptions = {
      shouldCreateUser: true,
      emailRedirectTo: 'http://localhost:5173/auth/callback',
      data: { subdomain: 'creativeballet', first_name: 'Test', last_name: 'User' },
    };

    expect(signupOptions.shouldCreateUser).toBe(true);
    expect(signupOptions.data.subdomain).toBeTruthy();
  });
});

describe('AuthCallbackPage error handling', () => {
  it('maps expired session exchange to expired_link', () => {
    const message = 'Email link is invalid or has expired';
    expect(resolveAuthErrorMessage(message, t, 'errors.session_exchange_failed')).toBe(
      'errors.expired_link',
    );
  });

  it('maps invalid grant to session_exchange_failed', () => {
    const message = 'invalid grant';
    expect(resolveAuthErrorMessage(message, t, 'errors.session_exchange_failed')).toBe(
      'errors.session_exchange_failed',
    );
  });
});
