// @vitest-environment jsdom
/**
 * YPay class (enrolment) checkout: the parent goes to YPay's own page (a full redirect, like the
 * project pay link) and comes back to /enrol/return/:engagementId, which waits for YPay's
 * verified callback. Before this, YPay fell through to the Stripe branch and hung on "Loading".
 * Run: pnpm -C apps/web test ypay-enrolment-checkout.test.tsx
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProviderCheckoutShell } from '../features/enrolment/components/EnrolmentCheckoutShells';
import EnrolReturnPage from '../pages/EnrolReturnPage';
import { isHostedPageCheckoutReady } from '@/lib/tenantProviderRouting';
import { readYpayReturnToken, rememberYpayReturnToken } from '../features/enrolment/lib/ypayReturn';
import { ypayEnrolmentReturnUrls } from '../../../../supabase/functions/_shared/payments/ypay/enrolment-return.ts';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn() }));
vi.mock('@/features/scheduling/components/AddToCalendarActions', () => ({ AddToCalendarActions: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));

const assign = vi.fn();

beforeEach(() => {
  vi.stubGlobal('location', { ...window.location, assign });
});

afterEach(() => {
  cleanup();
  invoke.mockReset();
  assign.mockReset();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function renderShell(pageUrl: string | null, enrolmentToken?: string) {
  invoke.mockResolvedValue({ data: { paid: false }, error: null });
  return render(
    <ProviderCheckoutShell
      classId="class-1"
      engagementId="eng-1"
      enrolmentToken={enrolmentToken}
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

function renderReturn(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/enrol/return/eng-1${search}`]}>
      <Routes>
        <Route path="/enrol/return/:engagementId" element={<EnrolReturnPage />} />
        <Route path="/enrol/pay/:engagementId" element={<p>pay page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('YPay class checkout', () => {
  it('counts a YPay payment page as a hosted-page checkout', () => {
    expect(isHostedPageCheckoutReady('ypay', 'https://pay.example/ypay/abc')).toBe(true);
    expect(isHostedPageCheckoutReady('ypay', null)).toBe(false);
  });

  it("sends the parent to YPay's page (no iframe), keeping the link token in this tab only", () => {
    renderShell('https://pay.example/ypay/abc', 'token-1');
    expect(screen.queryByText('common.loading')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByText('enrolment.ypay_continue'));
    expect(assign).toHaveBeenCalledWith('https://pay.example/ypay/abc');
    expect(readYpayReturnToken('eng-1')).toBe('token-1');
  });

  it('keeps the mock YPay page in the app for tests', () => {
    renderShell('https://mock.ypay.local/pay/x');
    expect(screen.getByTestId('ypay-mock-page')).toBeTruthy();
  });
});

describe('coming back from YPay', () => {
  it('waits for the confirmation, then shows Payment complete', async () => {
    rememberYpayReturnToken('eng-1', 'token-1');
    invoke.mockResolvedValue({ data: { paid: true, paymentId: 'pay-1' }, error: null });
    renderReturn('?result=success');
    await waitFor(() => expect(screen.getByText('pages.enrol_pay.already_paid_title')).toBeTruthy());
    expect(invoke).toHaveBeenCalledWith('get-payment-status', {
      body: { engagement_id: 'eng-1', enrolment_token: 'token-1' },
      headers: { Authorization: 'WaiverToken token-1' },
    });
  });

  it('a failed payment offers to try again on the class payment page', () => {
    rememberYpayReturnToken('eng-1', 'token-1');
    renderReturn('?result=failed');
    expect(screen.getByText('enrolment.ypay_failed')).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('enrolment.ypay_retry'));
    expect(screen.getByText('pay page')).toBeTruthy();
  });

  it("YPay's return addresses are the studio's own site, with no token in them", async () => {
    vi.stubEnv('APP_ROOT_DOMAIN', 'opalswift.test');
    const service = {
      from: () => ({
        select: () => ({
          eq: () => ({ single: async () => ({ data: { subdomain: 'studio', custom_domain: null }, error: null }) }),
        }),
      }),
    };
    await expect(ypayEnrolmentReturnUrls(service, 'tenant-1', 'eng-1')).resolves.toEqual({
      success: 'https://studio.opalswift.test/enrol/return/eng-1?result=success',
      failure: 'https://studio.opalswift.test/enrol/return/eng-1?result=failed',
    });
  });
});
