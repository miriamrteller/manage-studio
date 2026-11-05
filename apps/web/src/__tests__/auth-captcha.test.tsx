// @vitest-environment jsdom
/**
 * CAPTCHA tokens on every Supabase auth call that Attack Protection covers
 * (sign-in, sign-up, email codes and links, the current-password check), so the
 * owner can turn Supabase CAPTCHA on. With no VITE_TURNSTILE_SITE_KEY nothing changes.
 * Run: pnpm -C apps/web test auth-captcha.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  signInWithPassword: vi.fn(async () => ({ error: null })),
  signInWithOtp: vi.fn(async () => ({ error: null })),
  updateUser: vi.fn(async () => ({ error: null })),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: h.signInWithPassword,
      signInWithOtp: h.signInWithOtp,
      updateUser: h.updateUser,
      signOut: vi.fn(),
    },
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/lib/tenantMembership', () => ({ verifySessionBelongsToTenant: async () => 'ok' }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't-1' }) }));
// Stand-in for Cloudflare's widget: a button that "passes" the check.
vi.mock('@/components/captcha/TurnstileWidget', () => ({
  TurnstileWidget: ({ onToken }: { onToken: (t: string) => void }) => (
    <button type="button" onClick={() => onToken('tok-1')}>pass check</button>
  ),
}));

import { useLogin } from '@/hooks/useLogin';
import { LoginForm } from '@/components/shared/LoginForm';
import { sendLoginEmailOtp } from '@/lib/loginEmailOtp';
import { setLoginPassword } from '@/features/auth/lib/setLoginPassword';
import { useSignup } from '@/features/auth/hooks/useSignup';

function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname, origin: `https://${hostname}` },
  });
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

/** Renders the hook's widget and clicks "pass check". */
function passCheck(widget: ReactNode) {
  const { unmount } = render(<>{widget}</>);
  fireEvent.click(screen.getByRole('button', { name: 'pass check' }));
  unmount();
}

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  setHostname('creativeballet.opalswift.com');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('with no Turnstile site key: unchanged', () => {
  it('password sign-in sends just email and password; no check is shown', async () => {
    const { result } = renderHook(() => useLogin(), { wrapper });
    expect(result.current.captcha.widget).toBeNull();
    expect(result.current.captcha.ready).toBe(true);
    await act(() => result.current.onSubmit({ email: 'a@b.test', password: 'secret123' }, 'password'));
    expect(h.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.test', password: 'secret123' });
  });

  it('email codes send no captchaToken', async () => {
    await sendLoginEmailOtp('a@b.test', { shouldCreateUser: false, data: { subdomain: 's' } }, 'https://s/cb');
    expect(h.signInWithOtp).toHaveBeenCalledWith({
      email: 'a@b.test',
      options: { shouldCreateUser: false, emailRedirectTo: 'https://s/cb', data: { subdomain: 's' } },
    });
  });
});

describe('with a Turnstile site key', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-1');
  });

  it('password sign-in waits for the check, sends the token, then asks for a fresh check', async () => {
    const { result } = renderHook(() => useLogin(), { wrapper });
    expect(result.current.captcha.ready).toBe(false);
    passCheck(result.current.captcha.widget);
    expect(result.current.captcha.ready).toBe(true);
    await act(() => result.current.onSubmit({ email: 'a@b.test', password: 'secret123' }, 'password'));
    expect(h.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.test',
      password: 'secret123',
      options: { captchaToken: 'tok-1' },
    });
    expect(result.current.captcha.ready).toBe(false);
  });

  it('magic link and email code send the token', async () => {
    const { result } = renderHook(() => useLogin(), { wrapper });
    passCheck(result.current.captcha.widget);
    await act(() => result.current.onSubmit({ email: 'a@b.test' }, 'magic_link'));
    expect(h.signInWithOtp).toHaveBeenLastCalledWith({
      email: 'a@b.test',
      options: expect.objectContaining({ captchaToken: 'tok-1', shouldCreateUser: false }),
    });

    passCheck(result.current.captcha.widget);
    await act(() => result.current.sendEmailCode('a@b.test'));
    expect(h.signInWithOtp).toHaveBeenLastCalledWith({
      email: 'a@b.test',
      options: expect.objectContaining({ captchaToken: 'tok-1' }),
    });
  });

  it('the login form shows the check and keeps Sign in disabled until it passes', () => {
    render(
      <LoginForm
        isLoading={false}
        message={null}
        codeStep="send"
        codeEmail=""
        onSubmit={vi.fn()}
        onVerifyEmailCode={vi.fn()}
        onResendEmailCode={vi.fn()}
        onBackToCodeSend={vi.fn()}
        captcha={{ widget: <p>the check</p>, ready: false }}
      />,
    );
    expect(screen.getByText('the check')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pages.login.sign_in' })).toBeDisabled();
  });

  it('client signup by email sends the token', async () => {
    const { result } = renderHook(() => useSignup(), { wrapper });
    await act(() =>
      result.current.sendOtpAsync({
        channel: 'email',
        email: 'new@b.test',
        firstName: 'N',
        lastName: 'B',
        phone: '',
        captchaToken: 'tok-1',
      }),
    );
    expect(h.signInWithOtp).toHaveBeenCalledWith({
      email: 'new@b.test',
      options: expect.objectContaining({ shouldCreateUser: true, captchaToken: 'tok-1' }),
    });
  });

  it('the current-password check sends the token', async () => {
    await setLoginPassword({ email: 'a@b.test', password: 'new-pass-1', currentPassword: 'old', captchaToken: 'tok-1' });
    expect(h.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.test',
      password: 'old',
      options: { captchaToken: 'tok-1' },
    });
    expect(h.updateUser).toHaveBeenCalledWith({ password: 'new-pass-1' });
  });
});
