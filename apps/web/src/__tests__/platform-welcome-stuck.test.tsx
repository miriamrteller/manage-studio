// @vitest-environment jsdom
/**
 * app.opalswift.com stuck on "Loading..." (a session or profile that never answers) gets a way
 * out after a few seconds: try again, or sign in again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ signOut: vi.fn(), assign: vi.fn(), reload: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: null, isLoading: true }) }));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: null, isLoading: true }) }));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ language: 'en', setLanguage: vi.fn() }) }));
vi.mock('@/components/LegalFooterLinks', () => ({ LegalFooterLinks: () => <nav aria-label="Legal" /> }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: { signOut: (...a: unknown[]) => h.signOut(...a) } },
}));

import i18n from '@/i18n/i18n';
import PlatformWelcomePage from '@/features/platform-shell/PlatformWelcomePage';

const realLocation = window.location;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.setItem('sb-x-auth-token', 'saved');
  h.signOut.mockReset();
  h.signOut.mockImplementation(() => new Promise(() => undefined)); // even sign-out hangs
  h.assign.mockReset();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, assign: h.assign, reload: h.reload },
  });
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

function renderPage() {
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

describe('platform welcome page that never finishes loading', () => {
  it('shows "Loading..." first, then a way out after a few seconds', async () => {
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    expect(screen.queryByText('Sign in again')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_100);
    });
    expect(screen.getByText('This is taking longer than expected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('"Sign in again" clears the saved session even when sign-out hangs, then opens the sign-in page', async () => {
    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_100);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100);
    });
    expect(localStorage.getItem('sb-x-auth-token')).toBeNull();
    expect(h.assign).toHaveBeenCalledWith('/login');
  });

  it('"Try again" reloads the page', async () => {
    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_100);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(h.reload).toHaveBeenCalled();
  });
});
