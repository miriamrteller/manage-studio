// @vitest-environment jsdom
/**
 * A valid session whose profile call never answers is reported as a timeout (not as "no profile"),
 * so the platform page offers Try again / Sign in again instead of "not linked to a studio".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({ rpc: vi.fn(), timedOut: false }));
const SESSION = { user: { id: 'u1', email: 'o@x.test' } };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => h.rpc(...a),
    from: vi.fn(),
    auth: {
      getSession: async () => ({ data: { session: SESSION }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn(),
    },
  },
}));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => vi.fn() }));

import i18n from '@/i18n/i18n';
import { useCurrentUser } from '@/hooks/useCurrentUser';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  h.rpc.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('useCurrentUser when the profile call never answers', () => {
  it('reports a timeout after the wait limit, without retrying (no second wait)', async () => {
    h.rpc.mockImplementation(() => new Promise(() => undefined));
    const { result } = renderHook(() => useCurrentUser(), { wrapper: makeWrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50); // session loads, the profile call starts
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_200);
    });
    expect(result.current.profileTimedOut).toBe(true);
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it('a profile that simply does not exist is NOT a timeout', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useCurrentUser(), { wrapper: makeWrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(result.current.profileTimedOut).toBe(false);
    expect(result.current.isProfileChecked).toBe(true);
  });
});

describe('platform welcome page', () => {
  it('shows Try again / Sign in again when only the profile timed out, not "not linked to a studio"', async () => {
    h.rpc.mockImplementation(() => new Promise(() => undefined));
    vi.doMock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ language: 'en', setLanguage: vi.fn() }) }));
    vi.doMock('@/components/LegalFooterLinks', () => ({ LegalFooterLinks: () => <nav aria-label="Legal" /> }));
    vi.resetModules();
    const { default: PlatformWelcomePage } = await import('@/features/platform-shell/PlatformWelcomePage');
    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <PlatformWelcomePage />
          </MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_500);
    });
    expect(screen.getByText('This is taking longer than expected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
    expect(screen.queryByText(/isn't linked to a studio/i)).toBeNull();
  });
});
