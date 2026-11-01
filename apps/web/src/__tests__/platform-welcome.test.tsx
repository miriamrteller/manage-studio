// @vitest-environment jsdom
/**
 * app.opalswift.com shows OpalSwift's welcome / sign-in gate at "/".
 * Run: pnpm -C apps/web test platform-welcome.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  session: null as unknown,
  user: null as unknown,
  rows: [] as Array<{ id: string; name: string; subdomain: string }>,
  eqCalls: [] as unknown[],
  rpc: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: h.session, isLoading: false }) }));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: h.user, isLoading: false }) }));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ language: 'en', setLanguage: vi.fn() }) }));
vi.mock('@/components/LegalFooterLinks', () => ({ LegalFooterLinks: () => <nav aria-label="Legal" /> }));
vi.mock('@/lib/supabase', () => {
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: (...args: unknown[]) => { h.eqCalls.push(args); return builder; },
    then: (resolve: (v: unknown) => void) => resolve({ data: h.rows, error: null }),
  };
  return { supabase: { from: () => builder, rpc: h.rpc, auth: { signOut: vi.fn() } } };
});

import i18n from '@/i18n/i18n';
import { StudioHostGate } from '@/layouts/StudioHostGate';

function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname },
  });
}

function renderAt(path = '/') {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[path]}>
          <StudioHostGate>
            <p>studio app</p>
          </StudioHostGate>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const session = { user: { id: 'u-1' } };
const parent = { id: 'u-1', role: ['tenant_admin'], tenant_id: 't-1' };
const owner = { id: 'u-9', role: ['super_admin'], tenant_id: 't-0' };

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  setHostname('app.opalswift.com');
  h.session = null;
  h.user = null;
  h.rows = [];
  h.eqCalls = [];
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await i18n.changeLanguage('en');
});

describe('app.opalswift.com welcome', () => {
  it('signed out: OpalSwift welcome with Sign in, no studio wording', () => {
    renderAt();
    expect(screen.getByRole('heading', { name: 'Get paid. Stay compliant. Freelance in Israel.' })).toBeInTheDocument();
    expect(screen.getByText('Sign in to manage your studio.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'About OpalSwift' })).toHaveAttribute('href', 'https://opalswift.com');
    expect(screen.getByRole('navigation', { name: 'Legal' })).toBeInTheDocument();
    expect(screen.queryByText('studio app')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Ballet|Classes|Studio$/);
  });

  it('signed out, Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderAt();
    expect(screen.getByRole('button', { name: 'התחברות' })).toBeInTheDocument();
    expect(screen.getByText('תתרכז במה שאתה עושה הכי טוב. אנחנו נדאג לשאר.')).toBeInTheDocument();
  });

  it('signed in with one studio: links to its address', async () => {
    h.session = session;
    h.user = parent;
    h.rows = [{ id: 't-1', name: 'Creative Ballet Academy', subdomain: 'creativeballet' }];
    renderAt();
    const link = await screen.findByRole('link', { name: /Creative Ballet Academy/ });
    expect(link).toHaveAttribute('href', 'https://creativeballet.opalswift.com');
    expect(screen.getByRole('heading', { name: 'Your studio' })).toBeInTheDocument();
    expect(h.eqCalls).toEqual([['id', 't-1']]);
    expect(screen.queryByRole('link', { name: 'Set up a new studio' })).not.toBeInTheDocument();
  });

  it('platform owner with two studios: both listed, plus "Set up a new studio"', async () => {
    h.session = session;
    h.user = owner;
    h.rows = [
      { id: 't-1', name: 'Creative Ballet Academy', subdomain: 'creativeballet' },
      { id: 't-2', name: '', subdomain: 'lens-studio' },
    ];
    renderAt();
    expect(await screen.findByRole('heading', { name: 'Your studios' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Creative Ballet Academy/ })).toHaveAttribute('href', 'https://creativeballet.opalswift.com');
    expect(screen.getByRole('link', { name: /lens-studio/ })).toHaveAttribute('href', 'https://lens-studio.opalswift.com');
    expect(screen.getByRole('link', { name: 'Set up a new studio' })).toHaveAttribute('href', '/platform/onboard');
    expect(h.eqCalls).toEqual([]);
  });

  it('signed in with no studio, self-serve signup off: contact OpalSwift + sign out', () => {
    vi.stubEnv('VITE_ENABLE_SELF_SERVE_SIGNUP', 'false');
    h.session = session;
    renderAt();
    expect(screen.getByText("Your account isn't linked to a studio yet. Contact OpalSwift.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log ?out|sign out/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set up my studio' })).not.toBeInTheDocument();
  });

  it('signed in with no studio, self-serve signup on: the setup flow', () => {
    vi.stubEnv('VITE_ENABLE_SELF_SERVE_SIGNUP', 'true');
    h.session = session;
    renderAt();
    expect(screen.getByRole('button', { name: 'Set up my studio' })).toBeInTheDocument();
  });

  it('other paths on the app host are unchanged (login, onboarding, handoff)', () => {
    for (const path of ['/login', '/dashboard', '/platform/onboard', '/auth/session-handoff']) {
      const { unmount } = renderAt(path);
      expect(screen.getByText('studio app')).toBeInTheDocument();
      unmount();
    }
  });

  it('a studio host and plain localhost keep their own home page', () => {
    h.rpc.mockReturnValue(new Promise(() => {}));
    for (const host of ['creativeballet.opalswift.com', 'localhost']) {
      setHostname(host);
      const { unmount } = renderAt();
      expect(screen.getByText('studio app')).toBeInTheDocument();
      unmount();
    }
  });
});
