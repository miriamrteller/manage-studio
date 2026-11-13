// @vitest-environment jsdom
/**
 * Signing in on the platform host (app.<root>), which has no studio:
 * - the platform owner can sign in (and gets an account on first sign-in);
 * - any other email can sign in only if it exists, never create one;
 * - studio hosts are unchanged; a host that is neither is refused;
 * - after sign-in the platform host lands on the welcome page;
 * - auth emails for a studio-less account are OpalSwift-branded.
 * Run: pnpm -C apps/web test platform-owner-login.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({
  signInWithOtp: vi.fn(async () => ({ error: null })),
  user: null as unknown,
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithOtp: h.signInWithOtp } } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'he' } }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: { user: { id: 'u' } }, isLoading: false }) }));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: h.user, isLoading: false }) }));
vi.mock('@/hooks/useTenant', () => ({ useTenantQuery: () => ({ tenant: null, isLoading: false }), useTenant: () => null }));
vi.mock('@/hooks/useEntityLabels', () => ({ useEntityLabels: () => ({ vertical: 'generic' }) }));

import { loginOtpOptions } from '@/lib/loginOtpOptions';
import { useLogin } from '@/hooks/useLogin';
import DashboardRedirectPage from '@/pages/DashboardRedirectPage';
import { getTenantForAuthUser } from '../../../../supabase/functions/_shared/tenant-email';

function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname, origin: `https://${hostname}` },
  });
}

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  h.signInWithOtp.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('who may sign in from which host', () => {
  it('platform host: no account is created from the sign-in page (the owner already has one; the app does not know who the owner is)', () => {
    setHostname('app.opalswift.com');
    expect(loginOtpOptions('he')).toEqual({ shouldCreateUser: false, data: { language: 'he' } });
    expect(loginOtpOptions('en')).toEqual({ shouldCreateUser: false, data: { language: 'en' } });
  });

  it('studio host: unchanged (its subdomain, never creates an account)', () => {
    setHostname('creativeballet.opalswift.com');
    expect(loginOtpOptions('en')).toEqual({
      shouldCreateUser: false,
      data: { subdomain: 'creativeballet' },
    });
  });

  it('a host that is neither a studio nor the platform host is refused', () => {
    setHostname('opalswift.com');
    expect(loginOtpOptions('en')).toBeNull();
  });
});

describe('useLogin on the platform host', () => {
  it('sends the magic link with no studio, back to app.<root>/auth/callback', async () => {
    setHostname('app.opalswift.com');
    const { result } = renderHook(() => useLogin(), { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await act(async () => {
      await result.current.onSubmit({ email: 'owner@example.test' } as unknown as Parameters<ReturnType<typeof useLogin>['onSubmit']>[0], 'magic_link');
    });
    expect(h.signInWithOtp).toHaveBeenCalledWith({
      email: 'owner@example.test',
      options: expect.objectContaining({
        shouldCreateUser: false,
        data: { language: 'he' },
        emailRedirectTo: 'https://app.opalswift.com/auth/callback?login_method=magic_link',
      }),
    });
    expect(result.current.message?.type).not.toBe('error');
  });

  it('another email is sent a link only for an existing account', async () => {
    setHostname('app.opalswift.com');
    const { result } = renderHook(() => useLogin(), { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await act(async () => {
      await result.current.onSubmit({ email: 'someone@example.com' } as unknown as Parameters<ReturnType<typeof useLogin>['onSubmit']>[0], 'magic_link');
    });
    expect(h.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ shouldCreateUser: false }) }),
    );
  });
});

describe('after sign-in on the platform host', () => {
  it('the owner lands on the welcome page, not a studio page', () => {
    setHostname('app.opalswift.com');
    h.user = { id: 'u', role: ['super_admin'], tenant_id: null };
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardRedirectPage />} />
          <Route path="/" element={<p>welcome</p>} />
          <Route path="/classes" element={<p>classes</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('welcome')).toBeInTheDocument();
  });
});

describe('auth email for an account with no studio', () => {
  function fakeSupabase(profile: Record<string, unknown> | null) {
    return {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: table === 'user_profiles' ? profile : null, error: null }),
          }),
        }),
      }),
    } as never;
  }

  it('the owner (profile without a studio) gets OpalSwift branding in her language', async () => {
    const config = await getTenantForAuthUser(fakeSupabase({ tenant_id: null, language: 'he' }), {
      email: 'owner@example.test',
      user_metadata: {},
    });
    expect(config).toMatchObject({ id: '', name: 'OpalSwift', language: 'he', primary_color: '#4A58E8' });
  });

  it('no profile yet (first sign-in) and no studio: OpalSwift, language from the sign-in page', async () => {
    const config = await getTenantForAuthUser(fakeSupabase(null), {
      email: 'owner@example.test',
      user_metadata: { language: 'he' },
    });
    expect(config).toMatchObject({ name: 'OpalSwift', language: 'he' });
  });
});
