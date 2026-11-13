// @vitest-environment jsdom
/**
 * A photographer's flow is enquiry → quote → accept, so the booking pages point there
 * instead of saying "not available".
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import type { ReactElement } from 'react';

const h = vi.hoisted(() => ({ vertical: 'photographer', features: [] as string[] }));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't1', subdomain: 'lens', vertical: h.vertical }),
  useTenantQuery: () => ({ tenant: { id: 't1', subdomain: 'lens', vertical: h.vertical }, isLoading: false }),
}));
vi.mock('@/hooks/useFeatureGate', () => ({
  useFeatureGate: () => ({ hasFeature: (k: string) => h.features.includes(k), isLoading: false }),
}));
vi.mock('@/features/scheduling/servicesService', async (orig) => ({
  ...(await orig<object>()),
  ServicesService: { list: async () => [] },
}));
vi.mock('@/features/scheduling/bookingService', () => ({
  BookingService: { listBookableOfferings: async () => [] },
}));
vi.mock('@/features/scheduling/hooks/useIsNarrowViewport', () => ({ useIsNarrowViewport: () => true }));

import i18n from '@/i18n/i18n';
import BookingPage from '@/pages/BookingPage';
import BookingServicesPage from '@/pages/BookingServicesPage';

function renderIt(ui: ReactElement) {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

afterEach(() => {
  cleanup();
  h.vertical = 'photographer';
  h.features = [];
});

describe('photographer dead ends', () => {
  it('/book points clients to an enquiry', async () => {
    renderIt(<BookingPage />);
    expect(await screen.findByRole('link', { name: 'Send an enquiry' })).toHaveAttribute('href', '/inquire');
  });

  it('Packages open straight away for a Projects studio, no settings needed', async () => {
    h.features = ['billing:quotes.generate'];
    renderIt(<BookingServicesPage />);
    expect(await screen.findAllByRole('button', { name: /^Add / })).not.toHaveLength(0);
    expect(screen.queryByText(/not available on your current plan/)).toBeNull();
    expect(screen.queryByText(/Booking Settings/)).toBeNull();
  });

  it('never says "not on your plan"; an old link explains where to switch it on', () => {
    h.vertical = 'dance-studio';
    renderIt(<BookingServicesPage />);
    expect(screen.queryByText(/not available on your current plan/)).toBeNull();
    expect(screen.getByText(/Settings › Business/)).toBeInTheDocument();
  });
});
