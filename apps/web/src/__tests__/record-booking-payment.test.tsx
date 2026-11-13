// @vitest-environment jsdom
/**
 * Record a payment, PR 3: a booking waiting for payment can be recorded as paid directly
 * (cash / transfer / Bit), through the same dialog as the other flows. record-payment already
 * confirms the booking (finalise-payment checks the slot and activates it). Fakes only.
 * Run: pnpm -C apps/web test record-booking-payment.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { rows, modalProps } = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  modalProps: { current: null as Record<string, unknown> | null },
}));

vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't1', currency: 'ILS' }),
  useTenantQuery: () => ({ tenant: { id: 't1', currency: 'ILS' }, isLoading: false }),
}));
vi.mock('@/hooks/useEntityLabels', () => ({
  useEntityLabels: () => ({ vertical: 'beautician', profile: { clientBooking: false } }),
}));
vi.mock('@/features/crm/hooks/useLeads', () => ({ useLeads: () => ({ leads: [] }) }));
vi.mock('@/features/scheduling/components/BlockedTimesEditor', () => ({ BlockedTimesEditor: () => null }));
vi.mock('@/features/scheduling/components/GoogleCalendarSettings', () => ({ GoogleCalendarSettings: () => null }));
vi.mock('@/hooks/useFeatureGate', () => ({ useFeatureGate: () => ({ hasFeature: () => true, isLoading: false }) }));
vi.mock('@/features/scheduling/appointmentsService', () => ({ AppointmentsService: { list: async () => rows, close: vi.fn() } }));
vi.mock('@/features/scheduling/bookingSettingsService', () => ({ BookingSettingsService: { getSettings: async () => null } }));
vi.mock('@/features/scheduling/googleCalendarService', () => ({ GoogleCalendarService: { getConnection: async () => ({ connected: false }) } }));
vi.mock('@/features/finance/components/RecordPaymentModal', () => ({
  RecordPaymentModal: (props: Record<string, unknown>) => {
    modalProps.current = props;
    return <div>record-payment-dialog</div>;
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import AdminAppointmentsPage from '../pages/AdminAppointmentsPage';

afterEach(() => {
  cleanup();
  rows.length = 0;
  modalProps.current = null;
});

const row = (id: string, status: string) => ({
  id, status, booked_starts_at: '2026-11-10T09:00:00Z', booked_ends_at: '2026-11-10T10:00:00Z',
  google_event_id: null, payment_received_at: null, cancellation_reason: null, penalty_applied_at: null,
  offering_name: 'Portrait session', price_minor: 45000, currency: 'ILS', client_name: 'Dana', client_email: 'd@x.test',
});

describe('bookings: Record a payment', () => {
  it('a booking waiting for payment offers Record a payment, prefilled with its price', async () => {
    rows.push(row('e1', 'pending_payment'), row('e2', 'active'));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminAppointmentsPage />
      </QueryClientProvider>,
    );
    const buttons = await screen.findAllByRole('button', { name: 'finance.record_payment.open' });
    expect(buttons).toHaveLength(1); // only the booking waiting for payment
    fireEvent.click(buttons[0]);
    expect(screen.getByText('record-payment-dialog')).toBeTruthy();
    expect(modalProps.current).toMatchObject({ engagementId: 'e1', defaultAmountMinor: 45000, currency: 'ILS' });
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(screen.queryByText('record-payment-dialog')).toBeNull();
  });
});
