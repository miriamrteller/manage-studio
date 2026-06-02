import { describe, it, expect, vi, beforeEach } from 'vitest';
import { establishSessionFromAuthCallback } from '@/lib/authCallback';

const mockExchangeCodeForSession = vi.fn();
const mockVerifyOtp = vi.fn();
const mockSetSession = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args: unknown[]) =>
        mockExchangeCodeForSession(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      setSession: (...args: unknown[]) => mockSetSession(...args),
      getSession: () => mockGetSession(),
      onAuthStateChange: (callback: unknown) => mockOnAuthStateChange(callback),
    },
  },
}));

describe('establishSessionFromAuthCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('reuses an existing session without re-exchanging the code', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });

    const result = await establishSessionFromAuthCallback({
      search: '?code=already-used',
      hash: '',
    });

    expect(result).toEqual({ ok: true });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('exchanges PKCE code from captured search params', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const result = await establishSessionFromAuthCallback({
      search: '?code=abc123',
      hash: '',
    });

    expect(result).toEqual({ ok: true });
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc123');
  });

  it('maps magiclink type to email for verifyOtp', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });

    const result = await establishSessionFromAuthCallback({
      search: '?token_hash=hash123&type=magiclink',
      hash: '',
    });

    expect(result).toEqual({ ok: true });
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      token_hash: 'hash123',
      type: 'email',
    });
  });

  it('verifies PKCE token_hash from email template link', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });

    const result = await establishSessionFromAuthCallback({
      search: '?token_hash=pkce_abc123&type=email',
      hash: '',
    });

    expect(result).toEqual({ ok: true });
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      token_hash: 'pkce_abc123',
      type: 'email',
    });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('sets session from hash tokens when code is absent', async () => {
    mockSetSession.mockResolvedValue({ error: null });

    const result = await establishSessionFromAuthCallback({
      search: '',
      hash: '#access_token=at&refresh_token=rt&token_type=bearer&type=magiclink',
    });

    expect(result).toEqual({ ok: true });
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: 'at',
      refresh_token: 'rt',
    });
  });

  it('returns query auth errors from Supabase redirect', async () => {
    const result = await establishSessionFromAuthCallback({
      search: '?error=access_denied&error_description=PKCE+verifier+missing',
      hash: '',
    });

    expect(result).toEqual({ ok: false, message: 'PKCE verifier missing' });
  });

  it('accepts session after waiting for auth state', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockOnAuthStateChange.mockImplementation((callback: (event: string, session: unknown) => void) => {
      callback('SIGNED_IN', { user: { id: 'user-1' } });
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    const result = await establishSessionFromAuthCallback({
      search: '',
      hash: '',
    });

    expect(result).toEqual({ ok: true });
  });

  it('returns invalid_callback when nothing is present', async () => {
    vi.useFakeTimers();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const resultPromise = establishSessionFromAuthCallback({
      search: '',
      hash: '',
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;
    vi.useRealTimers();

    expect(result).toEqual({ ok: false, message: 'invalid_callback' });
  });
});
