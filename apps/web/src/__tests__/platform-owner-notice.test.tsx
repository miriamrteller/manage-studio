// @vitest-environment jsdom
/**
 * The OpalSwift platform owner (super_admin, one account) on a studio's own
 * address first gets a confirm page (owner decisions, 11 Nov 2026): tick "Yes,
 * I want to enter this studio's admin", with the warning that everything is
 * recorded, then continue as the studio's OpalSwift support login (a studio
 * admin of that studio, opened by platform-support-session), with a banner.
 * Never a bounce to /login (which looked signed out), never the /classes
 * fallback. A studio's own tenant_admin is unchanged.
 * Run: pnpm -C apps/web test platform-owner-notice.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({
  user: null as unknown,
  invoke: vi.fn(),
  setSession: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    auth: {
      setSession: (...a: unknown[]) => h.setSession(...a),
      signOut: () => { h.signOut(); return Promise.resolve({}); },
    },
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: { user: { id: 'u' } }, isLoading: false }) }));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: h.user, isLoading: false }) }));
vi.mock('@/hooks/useTenant', () => {
  const tenant = { id: 't-1', name: 'Creative Ballet', subdomain: 'creativeballet' };
  return { useTenant: () => tenant, useTenantQuery: () => ({ tenant, isLoading: false, notFound: false }) };
});
vi.mock('@/hooks/useEntityLabels', () => ({ useEntityLabels: () => ({ vertical: 'dance-studio' }) }));
vi.mock('@/hooks/usePlatformViewLog', () => ({ usePlatformViewLog: () => undefined }));
vi.mock('@/components/legal/MfaChallengeGate', () => ({ MfaChallengeGate: ({ children }: { children: unknown }) => children }));
vi.mock('@/components/legal/PlatformTermsGate', () => ({ PlatformTermsGate: ({ children }: { children: unknown }) => children }));
vi.mock('@/features/auth/components/SetPasswordPrompt', () => ({ SetPasswordPrompt: () => null }));

import i18n from '@/i18n/i18n';
import { AdminRoute, ParentRoute } from '@/layouts/RouteGuards';
import DashboardRedirectPage from '@/pages/DashboardRedirectPage';
import { PlatformOwnerNotice } from '@/components/PlatformOwnerNotice';

const OWNER = { id: 'u', role: ['super_admin'], tenant_id: null };
const ADMIN = { id: 'a', role: ['tenant_admin'], tenant_id: 't-1' };

function renderAt(path: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/setup" element={<AdminRoute><p>studio admin</p></AdminRoute>} />
          <Route path="/dashboard/portal" element={<ParentRoute><p>portal</p></ParentRoute>} />
          <Route path="/dashboard" element={<DashboardRedirectPage />} />
          <Route path="/platform-owner" element={<PlatformOwnerNotice />} />
          <Route path="/classes" element={<p>classes</p>} />
          <Route path="/login" element={<p>login page</p>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname: 'creativeballet.opalswift.com', protocol: 'https:', origin: 'https://creativeballet.opalswift.com' },
  });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  h.invoke.mockReset();
  h.setSession.mockReset();
  h.signOut.mockReset();
  await i18n.changeLanguage('en');
});

describe('the platform owner on a studio address', () => {
  beforeEach(() => {
    h.user = OWNER;
  });

  it('admin pages show the confirm page, with a way back to app.opalswift.com (not the sign-in page)', () => {
    renderAt('/admin/setup');
    expect(screen.getByRole('heading', { name: "You're signed in as the OpalSwift platform owner" })).toBeInTheDocument();
    expect(screen.getByTestId('support-access-warning')).toHaveTextContent('Everything is recorded');
    expect(screen.getByRole('link', { name: 'Back to app.opalswift.com' })).toHaveAttribute('href', 'https://app.opalswift.com');
    expect(screen.queryByText('studio admin')).toBeNull();
    expect(screen.queryByText('login page')).toBeNull();
  });

  it('ticking the box and continuing opens the studio support login, then the admin', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, access_token: 'at', refresh_token: 'rt' }, error: null });
    h.setSession.mockResolvedValue({ error: null });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    renderAt('/admin/setup');
    const enter = screen.getByRole('button', { name: "Enter the studio's admin" });
    expect(enter).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: "Yes, I want to enter Creative Ballet's admin" }));
    fireEvent.click(enter);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/admin/setup'));
    expect(h.invoke).toHaveBeenCalledWith('platform-support-session', { body: { tenantId: 't-1' } });
    expect(h.setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' });
  });

  it('says so when it did not work, and stays on the page', async () => {
    h.invoke.mockResolvedValue({ data: { ok: false, error: 'two_step_required' }, error: null });
    renderAt('/admin/setup');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: "Enter the studio's admin" }));
    expect(await screen.findByRole('alert')).toHaveTextContent('two-step code');
    expect(h.setSession).not.toHaveBeenCalled();
  });

  it('can sign out so the studio admin signs in on this device', async () => {
    renderAt('/admin/setup');
    fireEvent.click(screen.getByRole('button', { name: "Sign out, so the studio's admin can sign in here" }));
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(h.signOut).toHaveBeenCalled();
  });

  it('other studio pages too', () => {
    renderAt('/dashboard/portal');
    expect(screen.getByRole('heading', { name: /platform owner/ })).toBeInTheDocument();
  });

  it('after the handoff, /dashboard opens the confirm page, not /classes', async () => {
    renderAt('/dashboard');
    expect(await screen.findByRole('heading', { name: /platform owner/ })).toBeInTheDocument();
    expect(screen.queryByText('classes')).toBeNull();
  });

  it('in Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderAt('/admin/setup');
    expect(screen.getByRole('heading', { name: 'נכנסת כבעלת הפלטפורמה של OpalSwift' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'חזרה ל-app.opalswift.com' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'כניסה לניהול הסטודיו' })).toBeInTheDocument();
  });
});

describe("a studio's own admin is unchanged", () => {
  it('gets the admin pages, and /dashboard opens them', async () => {
    h.user = ADMIN;
    renderAt('/admin/setup');
    expect(screen.getByText('studio admin')).toBeInTheDocument();
  });

  it('/dashboard → /admin/setup', async () => {
    h.user = ADMIN;
    renderAt('/dashboard');
    expect(await screen.findByText('studio admin')).toBeInTheDocument();
  });
});

describe("the studio's OpalSwift support login", () => {
  it('gets the admin pages with the support banner; Leave signs it out and goes back to app.opalswift.com', async () => {
    h.user = { id: 's', role: ['tenant_admin'], tenant_id: 't-1', is_platform_support: true };
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    renderAt('/admin/setup');
    expect(screen.getByText('studio admin')).toBeInTheDocument();
    expect(screen.getByTestId('support-access-banner')).toHaveTextContent("You're in Creative Ballet's admin as OpalSwift support");
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://app.opalswift.com'));
    expect(h.signOut).toHaveBeenCalled();
  });

  it("a studio's own admin sees no banner", () => {
    h.user = ADMIN;
    renderAt('/admin/setup');
    expect(screen.queryByTestId('support-access-banner')).toBeNull();
  });
});
