// @vitest-environment jsdom
/**
 * Packages page: price, deposit (filled in as 30% of the price), shoot length, price display
 * and the online booking switch; location and "show on booking page" sit under the filled-in details.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';

const h = vi.hoisted(() => ({
  create: vi.fn(async () => ({})),
  update: vi.fn(async () => ({})),
  list: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't1', subdomain: 'lens', vertical: 'photographer', currency: 'ILS' }),
}));
vi.mock('@/hooks/useFeatureGate', () => ({
  useFeatureGate: () => ({ hasFeature: () => true, isLoading: false }),
}));
vi.mock('@/features/jobs/hooks/usePhotoShop', () => ({ usePhotoShopEnabled: () => false }));
vi.mock('@/features/scheduling/bookingSettingsService', () => ({
  BookingSettingsService: { getSettings: async () => ({ is_booking_enabled: true }) },
}));
vi.mock('@/features/scheduling/servicesService', async (orig) => {
  const real = await orig<typeof import('@/features/scheduling/servicesService')>();
  return {
    ...real,
    ServicesService: { list: async () => h.list, create: h.create, update: h.update, remove: vi.fn() },
  };
});

import i18n from '@/i18n/i18n';
import BookingServicesPage from '@/pages/BookingServicesPage';

function renderIt() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <BookingServicesPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(async () => {
  cleanup();
  h.create.mockClear();
  h.update.mockClear();
  h.list = [];
  await i18n.changeLanguage('en');
});

describe('Packages page', () => {
  it('a new package: deposit follows the price at 30% until changed, and every choice is saved', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add service' }));
    fireEvent.change(screen.getByLabelText('Service name'), { target: { value: 'Mini session' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '1000' } });
    expect(screen.getByLabelText(/^Deposit/)).toHaveValue(300);
    expect(screen.getByText('Filled in as 30% of the price. You can change it.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('How the price shows'), { target: { value: 'from' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Clients can book a time online' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save service' }));
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    expect(h.create.mock.calls[0][1]).toMatchObject({
      name: 'Mini session',
      price_minor: 100000,
      deposit_minor: 30000,
      price_display: 'from',
      online_booking: false,
      is_public: true,
    });
  });

  it('a deposit the owner typed stays when the price changes', async () => {
    h.list = [{
      id: 'p1', name: 'Wedding', duration_mins: 480, price_minor: 800000, currency: 'ILS', location: null,
      is_public: true, status: 'active', photos_included: 0, online_booking: true, price_display: 'show', deposit_minor: 100000,
    }];
    renderIt();
    expect(await screen.findByText(/Deposit/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText(/^Deposit/)).toHaveValue(1000);
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '9000' } });
    expect(screen.getByLabelText(/^Deposit/)).toHaveValue(1000);
  });

  it('location and "show on booking page" sit under the filled-in details', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add service' }));
    const details = screen.getByText('Details we filled in for you').closest('details')!;
    expect(details).toContainElement(screen.getByLabelText('Location (optional)'));
    expect(details).toContainElement(screen.getByRole('checkbox', { name: 'Show on booking page' }));
  });
});
