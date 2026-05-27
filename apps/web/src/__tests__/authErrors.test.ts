/**
 * Auth error classification for magic-link login/signup flows.
 * Run: pnpm -C apps/web test authErrors.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  classifyAuthError,
  isMagicLinkUserNotFoundError,
  resolveAuthErrorMessage,
} from '@/lib/authErrors';

const t = (key: string) => key;

describe('classifyAuthError', () => {
  it('maps user-not-found style messages', () => {
    expect(classifyAuthError('User not found')).toBe('user_not_found');
    expect(classifyAuthError('Signups not allowed for this instance')).toBe('user_not_found');
    expect(classifyAuthError('Database error saving new user')).toBe('user_not_found');
  });

  it('maps email delivery failures', () => {
    expect(classifyAuthError('Error sending magic link email')).toBe('email_delivery_failed');
    expect(classifyAuthError('SMTP connection failed')).toBe('email_delivery_failed');
  });

  it('maps rate limiting', () => {
    expect(classifyAuthError('Email rate limit exceeded')).toBe('rate_limited');
    expect(classifyAuthError('429 Too Many Requests')).toBe('rate_limited');
  });

  it('maps expired links', () => {
    expect(classifyAuthError('Email link is invalid or has expired')).toBe('expired_link');
    expect(classifyAuthError('OTP expired')).toBe('expired_link');
  });

  it('maps redirect mismatches', () => {
    expect(classifyAuthError('redirect_uri mismatch')).toBe('redirect_mismatch');
    expect(classifyAuthError('URL not allowed')).toBe('redirect_mismatch');
  });

  it('returns generic for unknown messages', () => {
    expect(classifyAuthError('Something unexpected happened')).toBe('generic');
  });
});

describe('resolveAuthErrorMessage', () => {
  it('returns i18n key for classified errors', () => {
    expect(resolveAuthErrorMessage('Error sending magic link email', t)).toBe(
      'errors.email_delivery_failed',
    );
    expect(resolveAuthErrorMessage('User not found', t)).toBe('errors.user_not_found');
  });

  it('uses fallback for generic errors without message', () => {
    expect(resolveAuthErrorMessage('', t, 'errors.signup_failed')).toBe('errors.signup_failed');
  });

  it('returns raw message for unclassified errors with content', () => {
    expect(resolveAuthErrorMessage('Custom provider error', t)).toBe('Custom provider error');
  });
});

describe('isMagicLinkUserNotFoundError', () => {
  it('detects user-not-found patterns', () => {
    expect(isMagicLinkUserNotFoundError('User not found')).toBe(true);
    expect(isMagicLinkUserNotFoundError('Error sending magic link email')).toBe(false);
  });
});

describe('login vs signup shouldCreateUser expectations', () => {
  it('documents login rejects unknown users via signups-not-allowed message', () => {
    expect(classifyAuthError('Signups not allowed for otp')).toBe('user_not_found');
  });
});
