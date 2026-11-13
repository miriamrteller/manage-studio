// @vitest-environment jsdom
/**
 * Header and footer name the studio by its display name, or by its subdomain when
 * it has none (or no tenant exists for the host). Never "Ballet School".
 * Run: pnpm -C apps/web test studio-name-fallback.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TenantConfig } from '@/types/auth';

const { tenantRef } = vi.hoisted(() => ({ tenantRef: { current: null as unknown } }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => tenantRef.current }));
vi.mock('../hooks/useTenant', () => ({ useTenant: () => tenantRef.current }));
vi.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: null, isLoading: false }) }));
vi.mock('../components/Navigation', () => ({
  AppHeader: () => null,
  NavDrawer: () => null,
  AreaTabs: () => null,
  NavDrawerProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useNavDrawer: () => ({ isPinned: false }),
}));
vi.mock('../components/LegalFooterLinks', () => ({ LegalFooterLinks: () => null }));
vi.mock('../components/ReportProblem', () => ({
  ReportProblemProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import i18n from '@/i18n/i18n';
import { AppLayout } from '../layouts/AppLayout';
import { HeaderLogo } from '@/components/Navigation/HeaderLogo';
import { readableSubdomain, studioDisplayName } from '@/lib/studioDisplayName';

function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname, pathname: '/' },
  });
}

function renderLayout() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AppLayout>
            <p>page</p>
          </AppLayout>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

function renderHeaderName(tenant: TenantConfig | null) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <HeaderLogo tenant={tenant} soft />
    </QueryClientProvider>,
  );
}

const year = new Date().getFullYear();
const named = { id: 't-1', name: 'Creative Ballet Academy', subdomain: 'creativeballet' } as TenantConfig;
const unnamed = { id: 't-1', name: '', subdomain: 'creativeballet' } as TenantConfig;

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  setHostname('creativeballet.opalswift.com');
});

afterEach(async () => {
  tenantRef.current = null;
  vi.unstubAllEnvs();
  await i18n.changeLanguage('en');
});

describe('studioDisplayName', () => {
  it('uses the tenant name, else its subdomain, else the URL', () => {
    expect(studioDisplayName(named, null)).toBe('Creative Ballet Academy');
    expect(studioDisplayName({ name: '  ', subdomain: 'creativeballet' }, null)).toBe('Creativeballet');
    expect(studioDisplayName(null, { kind: 'subdomain', subdomain: 'creativeballet' })).toBe('Creativeballet');
    expect(studioDisplayName(null, { kind: 'custom', host: 'app.creativeballetacademy.com' })).toBe(
      'Creativeballetacademy',
    );
    expect(studioDisplayName(null, { kind: 'custom', host: 'www.mystudio.co.il' })).toBe('Mystudio');
    expect(studioDisplayName(null, null)).toBe('');
  });

  it('makes a subdomain readable', () => {
    expect(readableSubdomain('creativeballet')).toBe('Creativeballet');
    expect(readableSubdomain('creative-ballet')).toBe('Creative ballet');
  });
});

describe.each(['en', 'he'] as const)('footer and header (%s)', (lang) => {
  beforeEach(async () => {
    await i18n.changeLanguage(lang);
  });

  it('named tenant: shows its name (default path unchanged)', () => {
    tenantRef.current = named;
    renderLayout();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('Creative Ballet Academy');
    expect(footer).toHaveTextContent(`© ${year} Creative Ballet Academy.`);
    renderHeaderName(named);
    expect(screen.getAllByText('Creative Ballet Academy').length).toBeGreaterThan(1);
  });

  it('tenant without a name: shows the subdomain', () => {
    tenantRef.current = unnamed;
    renderLayout();
    expect(screen.getByRole('heading', { name: 'Creativeballet' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent(`© ${year} Creativeballet.`);
    renderHeaderName(unnamed);
    expect(screen.getAllByText('Creativeballet')).toHaveLength(3);
  });

  it('no tenant for this host: shows the subdomain from the URL', () => {
    renderLayout();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(`© ${year} Creativeballet.`);
    expect(footer).not.toHaveTextContent(/Ballet School|School Management|בית הספר לבלט|ניהול בית הספר/);
    renderHeaderName(null);
    expect(screen.queryByText('Studio')).not.toBeInTheDocument();
    expect(screen.getAllByText('Creativeballet')).toHaveLength(3);
  });

  it('custom domain with no tenant: uses the host label that names the studio', () => {
    setHostname('app.creativeballetacademy.com');
    renderLayout();
    expect(screen.getByRole('contentinfo')).toHaveTextContent(`© ${year} Creativeballetacademy.`);
  });
});
