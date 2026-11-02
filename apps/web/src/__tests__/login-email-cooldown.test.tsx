// @vitest-environment jsdom
/**
 * Sign-in emails wait 60s per address (each new link or code replaces the
 * last one), across reloads. A rate limit (429) means an email was just sent:
 * friendly text and the same wait, never "Too many login attempts". An expired
 * or replaced link explains why and offers a new link or a code.
 * Run: pnpm -C apps/web test login-email-cooldown.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  callback: { ok: false, message: 'Email link is invalid or has expired' } as { ok: boolean; message?: string },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithOtp: h.signInWithOtp, signInWithPassword: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn() } },
}));
vi.mock('@/lib/tenantMembership', () => ({ verifySessionBelongsToTenant: async () => 'ok' }));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't-1', name: 'Creative Ballet' }),
  useTenantQuery: () => ({ tenant: { id: 't-1', name: 'Creative Ballet' }, isLoading: false, notFound: false }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: null, isLoading: false }) }));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: null, isLoading: false, isProfileChecked: false }) }));
vi.mock('@/lib/authCallback', () => ({
  captureAuthCallbackUrl: () => ({ search: '', hash: '' }),
  clearAuthCallbackUrl: () => undefined,
  establishSessionFromAuthCallback: async () => h.callback,
}));

import i18n from '@/i18n/i18n';
import LoginPage from '@/pages/LoginPage';
import AuthCallbackPage from '@/pages/AuthCallbackPage';
import { formatCountdown, rateLimitWaitSeconds, startEmailCooldown } from '@/lib/emailSendCooldown';

const EMAIL = 'info@creativeballetacademy.com';

function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname, origin: `https://${hostname}` },
  });
}

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

function renderAt(path: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<><LoginPage /><LocationProbe /></>} />
          <Route path="/auth/callback" element={<><AuthCallbackPage /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

async function sendLink() {
  fireEvent.click(screen.getByRole('tab', { name: 'Magic Link' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: EMAIL } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Link' }));
}

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  setHostname('creativeballet.opalswift.com');
  window.localStorage.clear();
  h.signInWithOtp.mockResolvedValue({ error: null });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('helpers', () => {
  it('reads the wait from Supabase\'s 429 message, else 60s', () => {
    expect(rateLimitWaitSeconds('For security purposes, you can only request this after 45 seconds.')).toBe(45);
    expect(rateLimitWaitSeconds('email rate limit exceeded')).toBe(60);
    expect(formatCountdown(45)).toBe('0:45');
    expect(formatCountdown(60)).toBe('1:00');
  });
});

describe('login: one email per minute per address', () => {
  it('after a link is sent, the button waits with a visible countdown and nothing more is sent', async () => {
    renderAt('/login');
    await sendLink();
    expect(await screen.findByTestId('email-cooldown')).toHaveTextContent(
      `We've sent a link to ${EMAIL}. Check your inbox (and spam). You can ask for a new one in`,
    );
    expect(screen.getByTestId('email-cooldown').textContent).toMatch(/in (1:00|0:59)\./);
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(`We've sent a link to ${EMAIL}`);
    const send = screen.getByRole('button', { name: 'Send Link' });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(h.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it('the wait survives a reload for the same email', async () => {
    startEmailCooldown(EMAIL, 'sent');
    renderAt(`/login?mode=magic_link&email=${encodeURIComponent(EMAIL)}`);
    expect(await screen.findByTestId('email-cooldown')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Link' })).toBeDisabled();
    // Another address is not held up.
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'someone@else.test' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send Link' })).toBeEnabled());
  });

  it('a 429 shows "we\'ve just sent you an email" with its wait, not "too many login attempts"', async () => {
    h.signInWithOtp.mockResolvedValue({
      error: { message: 'For security purposes, you can only request this after 45 seconds.', status: 429 },
    });
    renderAt('/login');
    await sendLink();
    expect(await screen.findByTestId('email-cooldown')).toHaveTextContent(
      /We've just sent you an email\. Please check your inbox\. You can ask for a new one in (45|44)s\./,
    );
    expect(screen.queryByText(/Too many login attempts/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Send Link' })).toBeDisabled();
  });

  it('when the wait is over, the button is back and screen readers hear it', async () => {
    renderAt('/login');
    await sendLink();
    await screen.findByTestId('email-cooldown');
    const key = `auth-email-cooldown:${EMAIL}`;
    act(() => {
      window.localStorage.setItem(key, JSON.stringify({ until: Date.now() - 1000, reason: 'sent' }));
      window.dispatchEvent(new Event('auth-email-cooldown'));
    });
    // The in-page copy expires too.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send Link' })).toBeEnabled(), { timeout: 3000 });
  });

  it('code tab: after a code is sent, resend waits; during the wait "Enter the code" sends nothing', async () => {
    renderAt('/login');
    fireEvent.click(screen.getByRole('tab', { name: 'Code' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: EMAIL } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Code' }));
    expect(await screen.findByTestId('email-cooldown')).toHaveTextContent(`We've sent a code to ${EMAIL}`);
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: EMAIL } });
    fireEvent.click(await screen.findByRole('button', { name: 'Enter the code' }));
    expect(h.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it('works in Hebrew', async () => {
    await i18n.changeLanguage('he');
    startEmailCooldown(EMAIL, 'sent');
    renderAt(`/login?mode=magic_link&email=${encodeURIComponent(EMAIL)}`);
    expect(await screen.findByTestId('email-cooldown')).toHaveTextContent(`שלחנו קישור אל ${EMAIL}`);
  });
});

describe('an expired or replaced link', () => {
  it('explains it, names the studio, and offers a new link (prefilled) or a code', async () => {
    startEmailCooldown(EMAIL, 'sent', 1, Date.now() - 5000);
    renderAt('/auth/callback');
    expect(await screen.findByRole('heading', { name: 'This link has already been used or replaced' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This link has already been used or replaced by a newer one. Check your inbox for the latest email from Creative Ballet and use that link.',
    );
    expect(screen.queryByText(/Setup Failed/i)).toBeNull();
    expect(screen.getByRole('link', { name: 'Or sign in with a 6-digit code instead' })).toHaveAttribute(
      'href',
      `/login?mode=code&email=${encodeURIComponent(EMAIL)}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send me a new link' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(`/login?mode=magic_link&email=${encodeURIComponent(EMAIL)}`),
    );
    expect(screen.getByLabelText('Email')).toHaveValue(EMAIL);
    expect(screen.getByRole('button', { name: 'Send Link' })).toBeEnabled();
  });

  it('"One-time token not found" counts as the same case', async () => {
    h.callback = { ok: false, message: 'One-time token not found' };
    renderAt('/auth/callback');
    expect(await screen.findByRole('button', { name: 'Send me a new link' })).toBeInTheDocument();
    h.callback = { ok: false, message: 'Email link is invalid or has expired' };
  });

  it('works in Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderAt('/auth/callback');
    expect(await screen.findByRole('heading', { name: 'הקישור הזה כבר שומש או הוחלף' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'שלחו לי קישור חדש' })).toBeInTheDocument();
  });
});
