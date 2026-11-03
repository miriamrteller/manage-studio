// @vitest-environment jsdom
/**
 * The OpalSwift platform owner (super_admin, one account) on a studio's own
 * address gets a clear notice instead of the studio's admin pages (owner
 * decision): never a bounce to /login (which looked signed out), never the
 * /classes fallback. A studio's own tenant_admin is unchanged.
 * Run: pnpm -C apps/web test platform-owner-notice.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({ user: null as unknown }));
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
  await i18n.changeLanguage('en');
});

describe('the platform owner on a studio address', () => {
  beforeEach(() => {
    h.user = OWNER;
  });

  it('admin pages show the notice, with a way back to app.opalswift.com (not the sign-in page)', () => {
    renderAt('/admin/setup');
    expect(screen.getByRole('heading', { name: "You're signed in as the OpalSwift platform owner" })).toBeInTheDocument();
    expect(screen.getByText("Studio admin pages are for the studio's own admins.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to app.opalswift.com' })).toHaveAttribute('href', 'https://app.opalswift.com');
    expect(screen.queryByText('studio admin')).toBeNull();
    expect(screen.queryByText('login page')).toBeNull();
  });

  it('other studio pages too', () => {
    renderAt('/dashboard/portal');
    expect(screen.getByRole('heading', { name: /platform owner/ })).toBeInTheDocument();
  });

  it('after the handoff, /dashboard opens the notice, not /classes', async () => {
    renderAt('/dashboard');
    expect(await screen.findByRole('heading', { name: /platform owner/ })).toBeInTheDocument();
    expect(screen.queryByText('classes')).toBeNull();
  });

  it('in Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderAt('/admin/setup');
    expect(screen.getByRole('heading', { name: 'נכנסת כבעלת הפלטפורמה של OpalSwift' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'חזרה ל-app.opalswift.com' })).toBeInTheDocument();
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
