// @vitest-environment jsdom
/**
 * Packages that can't be booked online (switch off, or price on request) get
 * an "Enquire" link that opens the enquiry form with the package filled in.
 * Run: pnpm -C apps/web test package-enquire.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import type { ReactElement } from 'react';

const PKG_ONLINE = '11111111-1111-4111-8111-111111111111';
const PKG_ASK = '22222222-2222-4222-8222-222222222222';

const h = vi.hoisted(() => ({
  offerings: [] as Array<Record<string, unknown>>,
  invoke: vi.fn(async (_fn: string, _opts: { body: Record<string, unknown> }) => ({ data: { ok: true }, error: null })),
}));

vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't1', name: 'Studio', subdomain: 'studio', vertical: 'generic', profile: { paymentFlow: 'recurring', teachesClasses: false, familyAccounts: false, clientBooking: true } }),
  useTenantQuery: () => ({ tenant: { id: 't1', subdomain: 'studio', vertical: 'generic', profile: { paymentFlow: 'recurring', teachesClasses: false } }, isLoading: false }),
}));
vi.mock('@/features/scheduling/bookingService', () => ({
  BookingService: { listBookableOfferings: async () => h.offerings },
}));
vi.mock('@/features/scheduling/components/BookingCalendar', () => ({ BookingCalendar: () => null }));
vi.mock('@/features/scheduling/hooks/useIsNarrowViewport', () => ({ useIsNarrowViewport: () => false }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: h.invoke },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { lead_form: { presets: {}, custom: [] } }, error: null }) }) }) }),
  },
}));
vi.mock('@/hooks/useSignedInPrefill', () => ({ useSignedInPrefill: () => ({}), useFillWhenEmpty: () => {} }));
vi.mock('@/lib/resolveTenantSubdomain', () => ({ resolveTenantSubdomain: () => 'studio' }));
vi.mock('@/legal/useLegalDocument', () => ({ useLegalLang: () => 'en' }));
vi.mock('@/components/PrivacyNotice', () => ({ PrivacyNotice: () => null }));
vi.mock('@/components/captcha/useCaptcha', () => ({ useCaptcha: () => ({ ready: true, token: null, reset: () => {}, widget: null }) }));

import i18n from '@/i18n/i18n';
import BookingPage from '@/pages/BookingPage';
import { InquiryForm } from '@/features/crm/components/InquiryForm';

const pkg = (id: string, name: string, extra: Record<string, unknown>) => ({
  id, name, duration_mins: 60, price_minor: 50000, currency: 'ILS', location: null,
  online_booking: true, price_display: 'show', ...extra,
});

function renderAt(ui: ReactElement, url = '/') {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

afterEach(() => {
  cleanup();
  h.invoke.mockClear();
});

describe('Enquire on packages that cannot be booked online', () => {
  it('the Book page lists them with an Enquire link to the form with the package', async () => {
    h.offerings = [
      pkg(PKG_ONLINE, 'Quick session', {}),
      pkg(PKG_ASK, 'Big event', { online_booking: false, price_display: 'on_request', price_minor: null }),
    ];
    renderAt(<BookingPage />, '/book');
    const list = await screen.findByTestId('enquire-packages');
    expect(list).toHaveTextContent('Big event');
    expect(list).toHaveTextContent('Price on request');
    expect(screen.getByRole('link', { name: 'Enquire' })).toHaveAttribute('href', `/inquire?package=${PKG_ASK}`);
    expect(screen.getByTestId('single-service')).toHaveTextContent('Quick session');
  });

  it('with nothing bookable online, the Book page still offers Enquire instead of "not available"', async () => {
    h.offerings = [pkg(PKG_ASK, 'Big event', { online_booking: false })];
    renderAt(<BookingPage />, '/book');
    expect(await screen.findByRole('link', { name: 'Enquire' })).toHaveAttribute('href', `/inquire?package=${PKG_ASK}`);
    expect(screen.queryByText(/not currently available/)).toBeNull();
  });

  it('the enquiry form shows the package and sends it with the enquiry', async () => {
    h.offerings = [pkg(PKG_ASK, 'Big event', { online_booking: false })];
    renderAt(<InquiryForm />, `/inquire?package=${PKG_ASK}`);
    expect(await screen.findByTestId('enquiry-package')).toHaveTextContent('About: Big event');
    fireEvent.change(document.getElementById('inquire-name')!, { target: { value: 'Dana' } });
    fireEvent.change(document.getElementById('inquire-email')!, { target: { value: 'dana@example.com' } });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(h.invoke).toHaveBeenCalled());
    expect(h.invoke.mock.calls[0][1].body.packageId).toBe(PKG_ASK);
  });

  it('an unknown package id is ignored', async () => {
    h.offerings = [];
    renderAt(<InquiryForm />, `/inquire?package=${PKG_ASK}`);
    await screen.findByRole('button', { name: 'Send' });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId('enquiry-package')).toBeNull();
  });
});
