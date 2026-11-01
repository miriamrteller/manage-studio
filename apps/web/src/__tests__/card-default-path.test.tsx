// @vitest-environment jsdom
/**
 * Default studio = registered business, monthly CARD payments through a provider, tax
 * documents on. The pay-at-the-studio fixes (offline-path-fixes.test.tsx) must leave this
 * path exactly as it was. These run the card path next to the offline one, so a card
 * regression fails CI.
 * Run: pnpm -C apps/web test card-default-path.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StepCheckout } from '../features/enrolment/components/StepCheckout';
import { CheckoutPaymentShell } from '../features/enrolment/components/CheckoutPaymentShell';
import type { CheckoutChargePayload } from '../features/enrolment/lib/checkoutBootstrapTypes';
import { enqueueDocument } from '../../../../supabase/functions/_shared/enqueue-document.ts';
import {
  ENROLMENT_DUNNING_DAY_OFFSETS,
  dunningLadderFor,
} from '../../../../supabase/functions/_shared/collections/enrolment-dunning-time.ts';
import {
  formatSavedCard,
  parseStudentBillingAccount,
  pickSavedCard,
} from '../features/students/lib/studentBillingAccount';

const { invalidateQueries, invoke } = vi.hoisted(() => ({ invalidateQueries: vi.fn(), invoke: vi.fn() }));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries } }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke }, rpc: vi.fn(), from: vi.fn() } }));
// The legal thread's terms box is not under test here: render the payment form it wraps.
vi.mock('../features/enrolment/components/EnrolmentTermsConsent', () => ({
  EnrolmentTermsConsent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: null, isLoading: false }) }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't-1', payment_provider: 'grow', invoicing_provider: 'grow' }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

afterEach(() => {
  cleanup();
  invalidateQueries.mockReset();
  invoke.mockReset();
  sessionStorage.clear();
});

const cardCharge: CheckoutChargePayload = {
  clientSecret: null,
  paymentIntentId: 'pi-1',
  publishableKey: null,
  amountMinor: 35000,
  currency: 'ILS',
  paymentProvider: 'grow',
  mockCompleted: false,
  mockPending: false,
  alreadyPaid: false,
  pageUrl: 'https://sandbox.meshulam.co.il/pay/abc',
  pendingWebhook: true,
  billingMode: 'recurring',
  billingInterval: 'monthly',
};

const wrap = (ui: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

describe('card studio: monthly subscription through the provider checkout', () => {
  it('shows the hosted card page and the "charged every month" hint, not the studio notice', () => {
    invoke.mockResolvedValue({ data: { paid: false }, error: null });
    wrap(
      <StepCheckout
        enrolmentData={{ offering_id: 'o-1', season_id: 's-1', person_id: 'p-1' }}
        checkoutEnrolmentId="eng-1"
        checkoutCharge={cardCharge}
        checkoutError={null}
        isPreparing={false}
        requireAuth={false}
        onPaymentSuccess={() => {}}
        onPrevious={() => {}}
      />,
    );
    expect(screen.getByText('enrolment.checkout_monthly_hint')).toBeInTheDocument();
    expect(screen.queryByText('enrolment.offline_monthly_hint')).toBeNull();
    expect(screen.queryByText('enrolment.offline_payment_title')).toBeNull();
    const iframe = document.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe(cardCharge.pageUrl);
  });

  it('keeps the enrolment intent and leaves the portal cache to the card-success redirect', () => {
    invoke.mockResolvedValue({ data: { paid: false }, error: null });
    sessionStorage.setItem('enrollmentIntent', JSON.stringify({ classId: 'c-1', seasonId: 's-1' }));
    wrap(
      <CheckoutPaymentShell classId="o-1" engagementId="eng-1" charge={cardCharge} onPaid={() => {}} onPrevious={() => {}} />,
    );
    // Only the offline finish clears these; the card flow is unchanged.
    expect(sessionStorage.getItem('enrollmentIntent')).not.toBeNull();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

describe('card studio: tax documents and dunning', () => {
  function service(invoicingProvider: string) {
    const insert = vi.fn();
    const from = (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) chain[m] = () => chain;
      chain.insert = (...args: unknown[]) => { insert(table, ...args); return chain; };
      chain.maybeSingle = async () => ({ data: table === 'tenants' ? { invoicing_provider: invoicingProvider } : null, error: null });
      chain.single = async () => ({ data: { id: 'q-1' }, error: null });
      return chain;
    };
    return { svc: { from } as never, insert };
  }

  it('queues a receipt for a card payment when the studio issues tax documents', async () => {
    const { svc, insert } = service('ypay');
    const result = await enqueueDocument(svc, { tenantId: 't-1', paymentId: 'pay-1', documentKind: 'sale' });
    expect(result.queued).toBe(true);
    expect(insert).toHaveBeenCalledWith('document_queue', expect.objectContaining({ document_kind: 'sale' }));
  });

  it('keeps the card dunning ladder at day 3 / 7 / 14', () => {
    for (const p of ['grow', 'ypay', 'icount', 'invoice4u', 'tranzila']) {
      expect(dunningLadderFor(p)).toEqual([3, 7, 14]);
    }
    expect(ENROLMENT_DUNNING_DAY_OFFSETS).toEqual([3, 7, 14]);
  });
});

describe('card studio: billing tab shows the account and the saved card', () => {
  it('parses the real account row and the default saved card', () => {
    const account = parseStudentBillingAccount({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'active',
      business_name: null,
      payer: { name: 'Dana Levi', email: 'dana@example.com' },
    });
    expect(account?.holderName).toBe('Dana Levi');
    const card = pickSavedCard([
      { card_brand: 'mastercard', last4: '1111', exp_month: 1, exp_year: 2028, is_default: false },
      { card_brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2027, is_default: true },
    ]);
    expect(card && formatSavedCard(card)).toBe('Visa •••• 4242 (12/27)');
  });

  it('has no saved card for a pay-at-the-studio account', () => {
    expect(pickSavedCard([])).toBeNull();
    expect(pickSavedCard(null)).toBeNull();
  });
});
