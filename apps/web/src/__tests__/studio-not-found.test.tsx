// @vitest-environment jsdom
/**
 * A studio host with no studio shows "Studio not found"; reserved hosts and real
 * studios are unchanged, and nothing flashes while the lookup runs.
 * Run: pnpm -C apps/web test studio-not-found.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
vi.mock('../lib/supabase', () => ({ supabase: { rpc } }));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ language: 'en', setLanguage: vi.fn() }) }));

import i18n from '@/i18n/i18n';
import { StudioHostGate } from '@/layouts/StudioHostGate';

function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname },
  });
}

const row = (name: string) => ({
  id: 't-1', name, tenant_subdomain: 'creativeballet', language_default: 'en', country: 'IL',
  currency: 'ILS', primary_color: '#000', accent_color: '#111', skin: 'dance-studio', labels: {},
  payment_provider: 'grow', invoicing_provider: 'grow', enabled_features: [],
});

function renderGate() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StudioHostGate>
          <p>studio app</p>
        </StudioHostGate>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  rpc.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await i18n.changeLanguage('en');
});

describe('StudioHostGate', () => {
  it('unknown subdomain → "Studio not found", with no sign-in or enrol actions', async () => {
    setHostname('creativeballet.opalswift.com');
    rpc.mockResolvedValue({ data: [], error: null });
    renderGate();
    expect(await screen.findByRole('heading', { name: 'Studio not found' })).toBeInTheDocument();
    expect(screen.getByText('creativeballet.opalswift.com')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent(
      "We couldn't find a studio at creativeballet.opalswift.com. Check the address.",
    );
    expect(screen.queryByText('studio app')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/sign in|log in|enrol/i)).not.toBeInTheDocument();
  });

  it('is in Hebrew when Hebrew is chosen', async () => {
    await i18n.changeLanguage('he');
    setHostname('creativeballet.opalswift.com');
    rpc.mockResolvedValue({ data: [], error: null });
    renderGate();
    expect(await screen.findByRole('heading', { name: 'הסטודיו לא נמצא' })).toBeInTheDocument();
  });

  it('unknown custom domain → "Studio not found"', async () => {
    setHostname('app.unknownstudio.com');
    rpc.mockResolvedValue({ data: [], error: null });
    renderGate();
    expect(await screen.findByRole('heading', { name: 'Studio not found' })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('get_tenant_config_by_host', { p_host: 'app.unknownstudio.com' });
  });

  it('app.opalswift.com (the shell) is unchanged and looks nothing up', () => {
    setHostname('app.opalswift.com');
    renderGate();
    expect(screen.getByText('studio app')).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('www and the apex are unchanged', () => {
    for (const host of ['www.opalswift.com', 'opalswift.com']) {
      setHostname(host);
      const { unmount } = renderGate();
      expect(screen.getByText('studio app')).toBeInTheDocument();
      unmount();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('named studio → the studio app (default path unchanged)', async () => {
    setHostname('creativeballet.opalswift.com');
    rpc.mockResolvedValue({ data: [row('Creative Ballet Academy')], error: null });
    renderGate();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.getByText('studio app')).toBeInTheDocument();
    expect(screen.queryByText('Studio not found')).not.toBeInTheDocument();
  });

  it('studio with no name → the studio app (header/footer use the subdomain)', async () => {
    setHostname('creativeballet.opalswift.com');
    rpc.mockResolvedValue({ data: [row('')], error: null });
    renderGate();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.getByText('studio app')).toBeInTheDocument();
  });

  it('no flash while loading, and a failed lookup is not "not found"', async () => {
    setHostname('creativeballet.opalswift.com');
    let resolve: (v: unknown) => void = () => {};
    rpc.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderGate();
    expect(screen.getByText('studio app')).toBeInTheDocument();
    expect(screen.queryByText('Studio not found')).not.toBeInTheDocument();
    resolve({ data: null, error: { message: 'network down' } });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Studio not found')).not.toBeInTheDocument();
    expect(screen.getByText('studio app')).toBeInTheDocument();
  });
});
