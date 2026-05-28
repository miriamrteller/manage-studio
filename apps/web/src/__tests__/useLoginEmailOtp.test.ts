/**
 * Login email OTP send/verify behavior.
 * Run: pnpm -C apps/web test useLoginEmailOtp.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendLoginEmailOtp, verifyLoginEmailOtp } from '@/lib/loginEmailOtp';
import { classifyAuthError, resolveAuthErrorMessage } from '@/lib/authErrors';

const mockSignInWithOtp = vi.fn();
const mockVerifyOtp = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
    },
  },
}));

const t = (key: string) => key;

describe('sendLoginEmailOtp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithOtp.mockResolvedValue({ error: null });
  });

  it('uses shouldCreateUser false and includes emailRedirectTo', async () => {
    await sendLoginEmailOtp('parent@example.com', 'creativeballet', 'http://localhost:5173/auth/callback');

    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'parent@example.com',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: 'http://localhost:5173/auth/callback',
        data: { subdomain: 'creativeballet' },
      },
    });
  });

  it('maps rate-limit errors', async () => {
    mockSignInWithOtp.mockResolvedValue({
      error: { message: 'Email rate limit exceeded' },
    });

    const { error } = await sendLoginEmailOtp('parent@example.com', 'creativeballet', 'http://localhost:5173/auth/callback');

    expect(error?.message).toBe('Email rate limit exceeded');
    expect(resolveAuthErrorMessage(error!.message, t, 'errors.login_failed')).toBe(
      'errors.rate_limited',
    );
  });
});

describe('verifyLoginEmailOtp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyOtp.mockResolvedValue({ error: null });
  });

  it('calls verifyOtp with type email', async () => {
    await verifyLoginEmailOtp('parent@example.com', '123456');

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: 'parent@example.com',
      token: '123456',
      type: 'email',
    });
  });

  it('maps expired OTP errors', async () => {
    mockVerifyOtp.mockResolvedValue({
      error: { message: 'OTP expired' },
    });

    const { error } = await verifyLoginEmailOtp('parent@example.com', '000000');

    expect(resolveAuthErrorMessage(error!.message, t, 'pages.login.invalid_code')).toBe(
      'errors.expired_link',
    );
  });

  it('maps invalid OTP errors', async () => {
    mockVerifyOtp.mockResolvedValue({
      error: { message: 'Invalid OTP' },
    });

    const { error } = await verifyLoginEmailOtp('parent@example.com', '000000');

    expect(resolveAuthErrorMessage(error!.message, t, 'pages.login.invalid_code')).toBe(
      'pages.login.invalid_code',
    );
  });
});

describe('email OTP error classification', () => {
  it('classifies verifyOtp failure strings', () => {
    expect(classifyAuthError('OTP expired')).toBe('expired_link');
    expect(classifyAuthError('Invalid OTP')).toBe('invalid_code');
    expect(resolveAuthErrorMessage('Invalid OTP', t)).toBe('pages.login.invalid_code');
  });
});
