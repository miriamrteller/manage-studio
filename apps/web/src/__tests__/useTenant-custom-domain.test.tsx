// @vitest-environment jsdom
/**
 * On a studio's custom domain (e.g. app.creativeballetacademy.com) the tenant is loaded by
 * host; on <subdomain>.<root> it is still loaded by subdomain.
 * Run: pnpm -C apps/web test useTenant-custom-domain.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
vi.mock('../lib/supabase', () => ({ supabase: { rpc } }));

import { useTenantQuery } from '../hooks/useTenant';
import { resolveTenantSubdomain } from '../lib/resolveTenantSubdomain';

function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname },
  });
}

const row = {
  id: 't-1', name: 'Creative Ballet Academy', tenant_subdomain: 'creativeballet',
  language_default: 'he', country: 'IL', currency: 'ILS', primary_color: '#000', accent_color: '#111',
  skin: 'dance-studio', labels: {}, payment_provider: 'offline', invoicing_provider: 'none',
  enabled_features: [],
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

afterEach(() => {
  rpc.mockReset();
  vi.unstubAllEnvs();
});

describe('useTenantQuery', () => {
  it('loads by host on a custom domain and remembers the subdomain', async () => {
    vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
    setHostname('app.creativeballetacademy.com');
    rpc.mockResolvedValue({ data: [row], error: null });

    const { result } = renderHook(() => useTenantQuery(), { wrapper });
    await waitFor(() => expect(result.current.tenant?.id).toBe('t-1'));

    expect(rpc).toHaveBeenCalledWith('get_tenant_config_by_host', { p_host: 'app.creativeballetacademy.com' });
    expect(result.current.tenant?.subdomain).toBe('creativeballet');
    expect(resolveTenantSubdomain()).toBe('creativeballet');
  });

  it('still loads by subdomain under the root domain', async () => {
    vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
    setHostname('creativeballet.opalswift.com');
    rpc.mockResolvedValue({ data: [row], error: null });

    const { result } = renderHook(() => useTenantQuery(), { wrapper });
    await waitFor(() => expect(result.current.tenant?.id).toBe('t-1'));
    expect(rpc).toHaveBeenCalledWith('get_tenant_config_by_subdomain', { p_subdomain: 'creativeballet' });
  });

  it('resolves to no tenant when no studio owns the custom host', async () => {
    vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
    setHostname('unknown.example.org');
    rpc.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useTenantQuery(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tenant).toBeNull();
  });
});
