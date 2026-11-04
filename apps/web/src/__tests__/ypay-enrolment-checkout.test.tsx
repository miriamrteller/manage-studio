// @vitest-environment jsdom
/**
 * YPay enrolment checkout: a YPay studio's class checkout shows YPay's payment page and waits
 * for the callback, instead of hanging on "Loading" (it fell through to the Stripe branch,
 * which has no client secret for YPay).
 * Run: pnpm -C apps/web test ypay-enrolment-checkout.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ProviderCheckoutShell } from '../features/enrolment/components/EnrolmentCheckoutShells';
import { isHostedPageCheckoutReady, isMockHostedPaymentPage } from '@/lib/tenantProviderRouting';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

function renderShell(pageUrl: string | null) {
  invoke.mockResolvedValue({ data: { paid: false }, error: null });
  return render(
    <ProviderCheckoutShell
      classId="class-1"
      engagementId="eng-1"
      paymentProvider="ypay"
      clientSecret={null}
      publishableKey={null}
      amountMinor={30000}
      currency="ILS"
      mockPaymentRef="ref-1"
      pageUrl={pageUrl}
      onPaid={() => {}}
      onPrevious={() => {}}
    />,
  );
}

describe('YPay enrolment checkout', () => {
  it('counts a YPay payment page as a hosted-page checkout', () => {
    expect(isHostedPageCheckoutReady('ypay', 'https://pay.example/ypay/abc')).toBe(true);
    expect(isHostedPageCheckoutReady('ypay', null)).toBe(false);
  });

  it("shows YPay's payment page, not the loading state", () => {
    renderShell('https://pay.example/ypay/abc');
    const iframe = screen.getByTitle('Secure payment') as HTMLIFrameElement;
    expect(iframe.src).toBe('https://pay.example/ypay/abc');
    expect(screen.queryByText('common.loading')).toBeNull();
  });

  it('shows the mock panel for the mock YPay page, not the generic test-card form', () => {
    // The generic mock card form confirms through confirm-mock-payment, which mock YPay doesn't use.
    expect(isMockHostedPaymentPage('ypay', 'https://mock.ypay.local/pay/x')).toBe(false);
    renderShell('https://mock.ypay.local/pay/x');
    expect(screen.getByTestId('ypay-mock-page')).toBeTruthy();
  });
});
