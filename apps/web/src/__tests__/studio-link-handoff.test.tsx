// @vitest-environment jsdom
/**
 * Opening a studio from app.opalswift.com lands signed in: the studio cards
 * hand the session to <studio>/auth/session-handoff (sessions are per
 * address), and drop it locally here so two addresses never refresh one
 * token. The handoff page speaks en + he and never keeps tokens in the URL.
 * Run: pnpm -C apps/web test studio-link-handoff.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  session: { access_token: 'acc.tok', refresh_token: 'ref-tok' } as null | { access_token: string; refresh_token: string },
  getSession: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  user: { id: 'u1', role: ['super_admin'], full_name: 'Miriam T' } as unknown,
  studios: [] as unknown[],
  handoff: { ok: true } as { ok: boolean; message?: string },
  cleared: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: h.getSession, signOut: h.signOut } } }));
vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: { user: { id: 'u1' } }, isLoading: false }) }));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: h.user, isLoading: false }) }));
vi.mock('@/features/platform-shell/useMyStudios', () => ({ useMyStudios: () => ({ data: h.studios, isLoading: false }) }));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ language: 'en', setLanguage: vi.fn() }) }));
vi.mock('@/lib/authCallback', () => ({
  captureAuthCallbackUrl: () => ({ search: '', hash: '' }),
  clearAuthCallbackUrl: h.cleared,
  establishSessionFromAuthCallback: async () => h.handoff,
}));

import i18n from '@/i18n/i18n';
import PlatformWelcomePage from '@/features/platform-shell/PlatformWelcomePage';
import SessionHandoffPage from '@/pages/auth/SessionHandoffPage';
import { openStudioSignedIn } from '@/features/self-serve/selfServeSignup';

const assign = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, hostname: 'app.opalswift.com', protocol: 'https:', assign },
  });
  h.session = { access_token: 'acc.tok', refresh_token: 'ref-tok' };
  h.getSession.mockImplementation(async () => ({ data: { session: h.session } }));
  h.studios = [
    { id: 's1', name: 'Creative Ballet', subdomain: 'creativeballet', url: 'https://creativeballet.opalswift.com', signupSource: 'operator', status: 'trialing', createdAt: '2026-10-01T00:00:00Z' },
  ];
  h.handoff = { ok: true };
});
afterEach(async () => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

function renderWelcome() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <PlatformWelcomePage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('opening a studio from app.opalswift.com', () => {
  it('hands the session to the studio address and drops it here (local only)', async () => {
    await openStudioSignedIn('creativeballet');
    expect(assign).toHaveBeenCalledWith(
      'https://creativeballet.opalswift.com/auth/session-handoff#access_token=acc.tok&refresh_token=ref-tok&token_type=bearer',
    );
    expect(h.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('without a session: the studio sign-in, nothing to drop', async () => {
    h.session = null;
    await openStudioSignedIn('creativeballet');
    expect(assign).toHaveBeenCalledWith('https://creativeballet.opalswift.com/login');
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it('the studio link on the welcome page opens it signed in', async () => {
    renderWelcome();
    const link = screen.getByRole('link', { name: /Creative Ballet/ });
    expect(link).toHaveAttribute('href', 'https://creativeballet.opalswift.com');
    fireEvent.click(link);
    await waitFor(() => expect(assign).toHaveBeenCalledWith(expect.stringContaining('creativeballet.opalswift.com/auth/session-handoff#')));
  });

  it('a new-tab click keeps the plain address (no session in a URL left lying around)', () => {
    renderWelcome();
    fireEvent.click(screen.getByRole('link', { name: /Creative Ballet/ }), { ctrlKey: true });
    expect(h.getSession).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('/auth/session-handoff on the studio address', () => {
  function renderHandoff() {
    return render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/auth/session-handoff']}>
          <Routes>
            <Route path="/auth/session-handoff" element={<SessionHandoffPage />} />
            <Route path="/dashboard" element={<p>dashboard</p>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );
  }

  it('takes over the session, clears the URL and opens the dashboard', async () => {
    renderHandoff();
    expect(await screen.findByText('dashboard')).toBeInTheDocument();
    expect(h.cleared).toHaveBeenCalled();
  });

  it('if it fails: a clear message and a sign-in link, and the URL is cleared anyway', async () => {
    h.handoff = { ok: false, message: 'Invalid Refresh Token' };
    renderHandoff();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't sign you in on this address.");
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText(/Invalid Refresh Token/)).toBeNull();
    expect(h.cleared).toHaveBeenCalled();
  });

  it('works in Hebrew', async () => {
    await i18n.changeLanguage('he');
    h.handoff = { ok: false };
    renderHandoff();
    expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו לחבר אותך בכתובת הזו');
    expect(screen.getByRole('link', { name: 'כניסה' })).toBeInTheDocument();
  });
});
