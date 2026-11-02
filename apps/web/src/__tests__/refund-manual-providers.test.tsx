// @vitest-environment jsdom
/**
 * Refunds for providers OpalSwift cannot refund through (payments audit P2 #14): YPay has no
 * refund API, Invoice4U's is off until the live check, iCount/Tranzila are not wired. The server
 * says "manual_refund_required" and the refund modal offers to record a refund made in the
 * provider's dashboard instead. Invoice4U's live call is tested with a stubbed fetch only.
 * Run: pnpm -C apps/web test refund-manual-providers.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Invoice4uPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/invoice4u.ts';
import {
  executeProviderRefund,
  ManualRefundRequiredError,
} from '../../../../supabase/functions/_shared/payments/refund-provider.ts';
import { makeGrowFakeService } from './helpers/growFakeService';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import { RefundPaymentModal } from '@/features/finance/components/RefundPaymentModal';

const QA_BASE = 'https://apiqa.invoice4u.co.il/Services/ApiService.svc';

function stubDenoEnv(vars: Record<string, string>) {
  (globalThis as unknown as { Deno?: unknown }).Deno = { env: { get: (k: string) => vars[k] } };
}

afterEach(() => {
  cleanup();
  invoke.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as unknown as { Deno?: unknown }).Deno;
});

function invoice4uService() {
  const fake = makeGrowFakeService({
    tables: { payments: [{ id: 'pay-1', tenant_id: 't1', provider: 'invoice4u', provider_payment_ref: 'PAY-77' }] },
  });
  (fake.service as { rpc: unknown }).rpc = async () => ({
    data: [{ payment_provider_public_key: '7', payment_provider_secret_key: 'i4u-key' }],
    error: null,
  });
  return fake.service;
}

describe('server: which refunds need the provider dashboard', () => {
  it('YPay, iCount and Tranzila always say manual_refund_required', async () => {
    for (const provider of ['ypay', 'icount', 'tranzila']) {
      await expect(
        executeProviderRefund(makeGrowFakeService().service, { provider, provider_payment_ref: 'ref-1' }, 1000),
      ).rejects.toBeInstanceOf(ManualRefundRequiredError);
    }
  });

  it('Invoice4U says manual_refund_required until INVOICE4U_LIVE_REFUND is on, without calling Invoice4U', async () => {
    stubDenoEnv({ INVOICE4U_API_BASE: QA_BASE });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const err = await new Invoice4uPaymentProvider(invoice4uService())
      .refundCharge({ providerPaymentRef: 'PAY-77', amountMinor: 12345 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ManualRefundRequiredError);
    expect((err as ManualRefundRequiredError).code).toBe('manual_refund_required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Invoice4U refunds through ProcessApiRequestV2 when switched on', async () => {
    stubDenoEnv({ INVOICE4U_API_BASE: QA_BASE, INVOICE4U_LIVE_REFUND: 'true' });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ d: { Errors: [], PaymentId: 'RF-9' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new Invoice4uPaymentProvider(invoice4uService())
      .refundCharge({ providerPaymentRef: 'PAY-77', amountMinor: 12345 });

    expect(result).toEqual({ providerRefundRef: 'RF-9' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe(`${QA_BASE}/ProcessApiRequestV2`);
    expect(JSON.parse(init.body).request).toEqual({
      Invoice4UUserApiKey: 'i4u-key',
      CreditCardCompanyType: 7,
      Refund: true,
      PaymentId: 'PAY-77',
      Sum: 123.45,
      IsQaMode: true,
    });
  });

  it('Invoice4U surfaces a provider error (e.g. unknown PaymentId)', async () => {
    stubDenoEnv({ INVOICE4U_API_BASE: QA_BASE, INVOICE4U_LIVE_REFUND: 'true' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ d: { Errors: [{ Id: 60, Error: 'PaymentIDDoesntExists' }] } }), { status: 200 },
    )));
    await expect(
      new Invoice4uPaymentProvider(invoice4uService()).refundCharge({ providerPaymentRef: 'PAY-77', amountMinor: 100 }),
    ).rejects.toThrow(/PaymentIDDoesntExists|60/);
  });
});

describe('refund modal', () => {
  const wrap = (provider: string) => render(
    <QueryClientProvider client={new QueryClient()}>
      <RefundPaymentModal paymentId="pay-1" totalMinor={10000} alreadyRefundedMinor={0} currency="ILS"
        provider={provider} onRefunded={vi.fn()} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );

  it('for YPay, explains the dashboard step and records a manual refund', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    wrap('ypay');
    expect(screen.getByRole('note')).toHaveTextContent('finance.refund_payment.manual_note');
    fireEvent.click(screen.getByRole('button', { name: 'finance.refund_payment.manual_submit' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('process-refund', {
      body: { payment_id: 'pay-1', reason: undefined, manual: true },
    }));
  });

  it('switches to recording a manual refund when the server says the provider cannot refund', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: {
        json: async () => ({ error: 'invoice4u refunds cannot be made from OpalSwift.', code: 'manual_refund_required' }),
      } },
    });
    wrap('invoice4u');
    fireEvent.click(screen.getByRole('button', { name: 'finance.refund_payment.submit' }));
    expect(await screen.findByRole('button', { name: 'finance.refund_payment.manual_submit' })).toBeTruthy();
    expect(screen.getByRole('note')).toHaveTextContent('finance.refund_payment.manual_note');
    expect(invoke).toHaveBeenLastCalledWith('process-refund', { body: { payment_id: 'pay-1', reason: undefined } });
  });

  it("shows the provider's own message for other failures", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: {
        json: async () => ({ error: 'Grow refundTransaction failed' }),
      } },
    });
    wrap('grow');
    fireEvent.click(screen.getByRole('button', { name: 'finance.refund_payment.submit' }));
    expect(await screen.findByText('Grow refundTransaction failed')).toBeTruthy();
  });
});
