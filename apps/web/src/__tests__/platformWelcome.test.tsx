// @vitest-environment jsdom
/**
 * app.opalswift.com welcome page when signed in: greeting + one "Your studios"
 * card, shared Buttons (primary = gradient), Logout in the header, and
 * "Platform features" as a link below the card.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  session: { value: { user: { id: 'u1' } } as unknown },
  user: { value: null as unknown },
  studios: { value: [] as unknown[] },
  lang: { value: 'en' },
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: mocks.session.value, isLoading: false }) }));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: mocks.user.value, isLoading: false }) }));
vi.mock('@/features/platform-shell/useMyStudios', () => ({
  useMyStudios: () => ({ data: mocks.studios.value, isLoading: false }),
}));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ language: mocks.lang.value, setLanguage: vi.fn() }) }));

import i18n from '@/i18n/i18n';
import PlatformWelcomePage from '@/features/platform-shell/PlatformWelcomePage';

const renderPage = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <PlatformWelcomePage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );

beforeEach(async () => {
  mocks.session.value = { user: { id: 'u1' } };
  mocks.studios.value = [];
  mocks.user.value = { id: 'u1', role: ['super_admin'], full_name: 'Miriam T' };
  await i18n.changeLanguage('en');
});

describe('signed-in welcome page', () => {
  it('empty state: greeting, "Your studios" card, one primary "Set up a new studio"', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome back, Miriam T');
    const card = screen.getByRole('region', { name: /studios/i });
    const setUp = within(card).getByRole('button', { name: 'Set up a new studio' });
    expect(setUp.className).toContain('var(--gradient-primary)');
    expect(setUp.className).toContain('rounded-[var(--radius-button)]');
  });

  it('Logout is in the header (a button), not in the content, and "Platform features" is a link below the card', () => {
    renderPage();
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByRole('button', { name: 'Logout' })).toBeNull();
    const features = within(screen.getByRole('main')).getByRole('link', { name: /Platform features/ });
    expect(features).toHaveAttribute('href', '/platform/features');
    expect(within(screen.getByRole('region', { name: /studios/i })).queryByText('Platform features')).toBeNull();
  });

  it('with studios: the Studios table, and a compact primary "Set up a new studio" in the card header', () => {
    mocks.studios.value = [
      { id: 's1', name: 'Creative Ballet', url: 'https://creativeballet.opalswift.com', signupSource: 'operator', status: 'trialing', createdAt: '2026-10-01T00:00:00Z' },
    ];
    renderPage();
    const card = screen.getByRole('region', { name: /studios/i });
    expect(within(card).getByRole('table')).toBeInTheDocument();
    expect(within(card).getAllByRole('button', { name: 'Set up a new studio' })).toHaveLength(1);
  });

  it('same header Logout on the "no studio" variant for a non-admin; no platform features link', () => {
    mocks.user.value = { id: 'u2', role: ['admin'], full_name: '' };
    renderPage();
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome back');
    expect(screen.queryByRole('link', { name: /Platform features/ })).toBeNull();
  });

  it('signed out: hero with a primary Sign in, and no Logout', () => {
    mocks.session.value = null;
    mocks.user.value = null;
    renderPage();
    expect(screen.getByRole('button', { name: 'Sign in' }).className).toContain('var(--gradient-primary)');
    expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull();
  });

  it('is in Hebrew with the same structure', async () => {
    await i18n.changeLanguage('he');
    mocks.lang.value = 'he';
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('שמחים לראות אותך שוב, Miriam T');
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'התנתקות' })).toBeInTheDocument();
  });
});
