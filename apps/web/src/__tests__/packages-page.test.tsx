// @vitest-environment jsdom
/**
 * Packages page: how the price shows, the deposit percent (Projects) and the online booking
 * switch (instant booking only); location and "show on booking page" sit under the filled-in details.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';

const h = vi.hoisted(() => ({
  create: vi.fn(async (_tenant: unknown, _input: Record<string, unknown>) => ({})),
  update: vi.fn(async () => ({})),
  list: [] as Array<Record<string, unknown>>,
  profile: { paymentFlow: 'project', teachesClasses: false, familyAccounts: false, clientBooking: false },
}));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't1', subdomain: 'lens', vertical: 'photographer', currency: 'ILS', profile: h.profile }),
}));
vi.mock('@/hooks/useHasFeature', () => ({
  useHasFeature: () => ({ hasFeature: () => true, hasAnyFeature: () => true, isLoading: false }),
}));
vi.mock('@/features/jobs/hooks/usePhotoShop', () => ({ usePhotoShopEnabled: () => false }));
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
  h.profile = { paymentFlow: 'project', teachesClasses: false, familyAccounts: false, clientBooking: false };
  await i18n.changeLanguage('en');
});

async function openAdd() {
  renderIt();
  fireEvent.click(await screen.findByRole('button', { name: /^Add / }));
}

describe('Packages page', () => {
  it('Projects: deposit starts at the usual 30%, price display is saved, no online switch', async () => {
    await openAdd();
    expect(screen.getByLabelText(/^Deposit \(%\)/)).toHaveValue(30);
    expect(screen.queryByRole('checkbox', { name: 'Clients can book a time online' })).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Name|name$/i), { target: { value: 'Mini session' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/^Deposit \(%\)/), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('How the price shows'), { target: { value: 'on_request' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    const input = h.create.mock.calls[0][1];
    expect(input).toMatchObject({ price_minor: 100000, deposit_percent: 50, price_display: 'on_request', is_public: true });
    expect(input).not.toHaveProperty('online_booking');
  });

  it('Appointments only: the online booking switch shows and is saved; no deposit', async () => {
    h.profile = { paymentFlow: 'recurring', teachesClasses: false, familyAccounts: false, clientBooking: true };
    await openAdd();
    expect(screen.queryByLabelText(/^Deposit \(%\)/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Name|name$/i), { target: { value: 'Facial' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Clients can book a time online' }));
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    const input = h.create.mock.calls[0][1];
    expect(input).toMatchObject({ online_booking: false, price_display: 'show' });
    expect(input).not.toHaveProperty('deposit_percent');
  });

  it('the list shows the price as chosen and the deposit', async () => {
    h.list = [{
      id: 'p1', name: 'Wedding', duration_mins: 480, price_minor: 800000, currency: 'ILS', location: null,
      is_public: true, status: 'active', photos_included: 0, online_booking: true, price_display: 'from', deposit_percent: 40,
    }];
    renderIt();
    expect(await screen.findByText(/From .*8,000.* · Deposit 40%/)).toBeInTheDocument();
  });

  it('location and "show on booking page" sit under the filled-in details', async () => {
    await openAdd();
    const details = screen.getByText('Details we filled in for you').closest('details')!;
    expect(details).toContainElement(screen.getByLabelText('Location (optional)'));
    expect(details).toContainElement(screen.getByRole('checkbox', { name: 'Show on booking page' }));
  });
});
