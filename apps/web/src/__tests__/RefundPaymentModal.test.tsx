// @vitest-environment jsdom
/**
 * I4a-T4 — RefundPaymentModal shows provider-appropriate refund notes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RefundPaymentModal } from '@/features/finance/components/RefundPaymentModal';

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
    i18n: { language: 'en' },
  }),
}));

function renderModal(provider?: string) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RefundPaymentModal
        paymentId="pay-1"
        totalMinor={35000}
        alreadyRefundedMinor={0}
        currency="ILS"
        provider={provider}
        onRefunded={() => {}}
        onCancel={() => {}}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('RefundPaymentModal provider notes (I4a-T4)', () => {
  it('shows Grow same-day refund note for grow provider', () => {
    renderModal('grow');
    expect(screen.getByText(/same day as the charge/i)).toBeTruthy();
    expect(screen.queryByText(/credit note/i)).toBeNull();
  });

  it('shows iCount credit-note note for icount provider', () => {
    renderModal('icount');
    expect(screen.getByText(/credit note/i)).toBeTruthy();
    expect(screen.queryByText(/same day as the charge/i)).toBeNull();
  });

  it('shows generic bundled note for other providers', () => {
    renderModal('stripe');
    expect(screen.getByText(/sent to your payment provider/i)).toBeTruthy();
  });
});
