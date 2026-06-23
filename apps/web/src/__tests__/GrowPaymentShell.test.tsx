// @vitest-environment jsdom
/**
 * G5: the Grow hosted-page shell renders the iframe and resolves once the status poll reports
 * the webhook-confirmed payment.
 * Run: pnpm -C apps/web test GrowPaymentShell.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { GrowPaymentShell } from '../features/enrolment/components/GrowPaymentShell';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
    i18n: { language: 'en' },
  }),
}));

afterEach(() => {
  cleanup();
  invoke.mockReset();
  vi.useRealTimers();
});

describe('GrowPaymentShell', () => {
  it('renders the hosted payment page in an iframe', () => {
    invoke.mockResolvedValue({ data: { paid: false }, error: null });
    render(
      <GrowPaymentShell
        engagementId="eng-1"
        pageUrl="https://sandbox.meshulam.co.il/pay/abc"
        onPaid={() => {}}
        onPrevious={() => {}}
      />,
    );

    const iframe = screen.getByTitle('Secure payment') as HTMLIFrameElement;
    expect(iframe.src).toBe('https://sandbox.meshulam.co.il/pay/abc');
  });

  it('calls onPaid once the status poll reports the payment as paid', async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue({ data: { paid: true, paymentId: 'pay-1' }, error: null });
    const onPaid = vi.fn();

    render(
      <GrowPaymentShell
        engagementId="eng-1"
        pageUrl="https://sandbox.meshulam.co.il/pay/abc"
        onPaid={onPaid}
        onPrevious={() => {}}
      />,
    );

    await vi.advanceTimersByTimeAsync(3000);

    expect(invoke).toHaveBeenCalledWith(
      'get-payment-status',
      expect.objectContaining({ body: expect.objectContaining({ engagement_id: 'eng-1' }) }),
    );
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('shows a retry CTA when the poll reports a failure reason', async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue({
      data: { paid: false, failureReason: 'Card declined' },
      error: null,
    });

    render(
      <GrowPaymentShell
        engagementId="eng-1"
        pageUrl="https://sandbox.meshulam.co.il/pay/abc"
        onPaid={() => {}}
        onPrevious={() => {}}
      />,
    );

    await vi.advanceTimersByTimeAsync(3000);
    vi.useRealTimers();

    await waitFor(() => expect(screen.getByText('Card declined')).toBeTruthy());
    expect(screen.getByText('Retry')).toBeTruthy();
  });
});
