// @vitest-environment jsdom
/**
 * app.opalswift.com has no studio: /signup goes to OpalSwift HQ's enquiry form
 * (or /create-studio when self-serve signup is on), and studio-only pages show
 * a clear notice instead of "Loading studio information..." forever.
 * Run: pnpm -C apps/web test platform-signup.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, auth: {} } }));
vi.mock('../lib/supabase', () => ({ supabase: { rpc, auth: {} } }));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ language: 'en', setLanguage: vi.fn() }) }));

import i18n from '@/i18n/i18n';
import { StudioHostGate } from '@/layouts/StudioHostGate';
import { isStudioOnlyPath, platformSignupUrl } from '@/lib/platformSignup';

const replace = vi.fn();
const assign = vi.fn();

function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname, replace, assign },
  });
}

function renderGate(path: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[path]}>
          <StudioHostGate>
            <Routes>
              <Route path="*" element={<p>studio app</p>} />
              <Route path="/create-studio" element={<p>create studio page</p>} />
            </Routes>
          </StudioHostGate>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  vi.stubEnv('VITE_ENABLE_SELF_SERVE_SIGNUP', 'false');
  setHostname('app.opalswift.com');
});

afterEach(async () => {
  rpc.mockReset();
  replace.mockReset();
  assign.mockReset();
  vi.unstubAllEnvs();
  await i18n.changeLanguage('en');
});

describe('sign up on the platform host', () => {
  it('goes to the HQ enquiry form, built from the root domain', () => {
    expect(platformSignupUrl()).toBe('https://hq.opalswift.com/inquire?src=app');
    vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'staging.example.net');
    expect(platformSignupUrl()).toBe('https://hq.staging.example.net/inquire?src=app');
  });

  it('goes to /create-studio when self-serve signup is on', () => {
    vi.stubEnv('VITE_ENABLE_SELF_SERVE_SIGNUP', 'true');
    expect(platformSignupUrl()).toBe('/create-studio');
  });

  it('/signup leaves for the enquiry form, with a link if the redirect is slow', () => {
    renderGate('/signup');
    expect(replace).toHaveBeenCalledWith('https://hq.opalswift.com/inquire?src=app');
    expect(screen.getByRole('status')).toHaveTextContent('Taking you to OpalSwift sign-up…');
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', 'https://hq.opalswift.com/inquire?src=app');
    expect(screen.queryByText('studio app')).not.toBeInTheDocument();
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
  });

  it('/signup opens /create-studio in the app when self-serve is on', async () => {
    vi.stubEnv('VITE_ENABLE_SELF_SERVE_SIGNUP', 'true');
    renderGate('/signup');
    expect(await screen.findByText('create studio page')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('is in Hebrew when Hebrew is chosen', async () => {
    await i18n.changeLanguage('he');
    renderGate('/signup');
    expect(screen.getByRole('status')).toHaveTextContent('מעבירים אותך להרשמה ל-OpalSwift…');
  });
});

describe('studio-only pages on the platform host', () => {
  it.each(['/classes', '/book', '/book/abc', '/enrol', '/inquire', '/f/trial'])('%s shows a notice, not a spinner', (path) => {
    const { unmount } = renderGate(path);
    expect(screen.getByRole('heading', { name: 'This page belongs to a studio' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to OpalSwift home' })).toHaveAttribute('href', '/');
    expect(screen.queryByText('studio app')).not.toBeInTheDocument();
    unmount();
  });

  it('the notice is in Hebrew when Hebrew is chosen', async () => {
    await i18n.changeLanguage('he');
    renderGate('/classes');
    expect(screen.getByRole('heading', { name: 'הדף הזה שייך לסטודיו' })).toBeInTheDocument();
  });

  it('login, dashboard and platform pages still open', () => {
    for (const path of ['/login', '/dashboard', '/platform/onboard', '/create-studio', '/enrol/complete']) {
      expect(isStudioOnlyPath(path)).toBe(false);
    }
    renderGate('/login');
    expect(screen.getByText('studio app')).toBeInTheDocument();
  });

  it('on a studio host the same paths are the studio app', async () => {
    setHostname('creativeballet.opalswift.com');
    rpc.mockReturnValue(new Promise(() => {}));
    renderGate('/signup');
    expect(screen.getByText('studio app')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
