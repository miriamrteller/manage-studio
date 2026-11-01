// @vitest-environment jsdom
/**
 * Public checkout for a studio with no online payment provider: the parent picks cash or
 * bank transfer, the choice is recorded through request-offline-payment (with the guest
 * token when there is one) and the caller is told so it can show the "reserved" screen.
 * Run: pnpm -C apps/web test OfflinePaymentPanel.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { OfflinePaymentPanel } from '../features/enrolment/components/OfflinePaymentPanel';
import { CheckoutPaymentShell } from '../features/enrolment/components/CheckoutPaymentShell';
import type { CheckoutChargePayload } from '../features/enrolment/lib/checkoutBootstrapTypes';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string; method?: string }) =>
      opts?.defaultValue ?? (opts?.method ? `${key}:${opts.method}` : key),
    i18n: { language: 'en' },
  }),
}));

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

const baseProps = {
  classId: 'class-1',
  engagementId: 'eng-1',
  amountMinor: 35000,
  currency: 'ILS',
  instructions: 'Bank 12-345\ncash at the desk',
  onPrevious: () => {},
};

describe('OfflinePaymentPanel', () => {
  it('offers cash and bank transfer, shows the studio instructions and no card form', () => {
    render(<OfflinePaymentPanel {...baseProps} onRequested={() => {}} />);
    expect(screen.getByRole('radio', { name: 'enrolment.offline.method_cash' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'enrolment.offline.method_bank_transfer' })).not.toBeChecked();
    expect(screen.getByText(/Bank 12-345/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('records the choice with the guest token and reports it to the caller', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, paymentId: 'pay-1', offlineInstructions: 'Bank 12-345\ncash at the desk' },
      error: null,
    });
    const onRequested = vi.fn();
    render(<OfflinePaymentPanel {...baseProps} enrolmentToken="tok" onRequested={onRequested} />);

    fireEvent.click(screen.getByRole('radio', { name: 'enrolment.offline.method_bank_transfer' }));
    fireEvent.click(screen.getByRole('button', { name: 'enrolment.offline.confirm_action' }));

    await waitFor(() => expect(onRequested).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith('request-offline-payment', {
      body: {
        engagement_id: 'eng-1',
        offering_id: 'class-1',
        method: 'bank_transfer',
        enrolment_token: 'tok',
      },
      headers: { Authorization: 'WaiverToken tok' },
    });
    expect(onRequested).toHaveBeenCalledWith({
      method: 'bank_transfer',
      instructions: 'Bank 12-345\ncash at the desk',
    });
  });

  it('shows the server error and does not advance', async () => {
    invoke.mockResolvedValue({ data: { error: 'Engagement is not payable' }, error: null });
    const onRequested = vi.fn();
    render(<OfflinePaymentPanel {...baseProps} onRequested={onRequested} />);

    fireEvent.click(screen.getByRole('button', { name: 'enrolment.offline.confirm_action' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Engagement is not payable');
    expect(onRequested).not.toHaveBeenCalled();
  });

  it('falls back to a generic line when the studio wrote no instructions', () => {
    render(<OfflinePaymentPanel {...baseProps} instructions={null} onRequested={() => {}} />);
    expect(screen.getByText('enrolment.offline.instructions_fallback')).toBeInTheDocument();
  });
});

describe('CheckoutPaymentShell with paymentProvider "none"', () => {
  it('renders the pay-at-the-studio panel instead of a provider checkout', () => {
    const charge: CheckoutChargePayload = {
      clientSecret: null,
      paymentIntentId: null,
      publishableKey: null,
      amountMinor: 35000,
      currency: 'ILS',
      paymentProvider: 'none',
      mockCompleted: false,
      mockPending: false,
      alreadyPaid: false,
      pageUrl: null,
      pendingWebhook: false,
      billingMode: 'one_time',
      billingInterval: null,
      offlineInstructions: 'Pay the teacher',
    };
    render(
      <CheckoutPaymentShell
        classId="class-1"
        engagementId="eng-1"
        charge={charge}
        onPaid={() => {}}
        onPrevious={() => {}}
      />,
    );
    expect(screen.getByTestId('offline-payment-panel')).toBeInTheDocument();
    expect(screen.getByText('Pay the teacher')).toBeInTheDocument();
    expect(screen.queryByTitle('Secure payment')).toBeNull();
  });
});
