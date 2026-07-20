/**
 * U2a — Invoice4U form callback parse, amount verify, PaymentId upgrade, failure path.
 * Run: pnpm -C apps/web test invoice4u-callback.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildMockInvoice4uCallbackBody,
  minorFromInvoice4uAmount,
  parseInvoice4uCallback,
  peekInvoice4uOrderId,
  buildInvoice4uDocumentUrl,
} from '../../../../supabase/functions/_shared/payments/invoice4u/callback.ts';
import { processInvoice4uPaymentCallback } from '../../../../supabase/functions/_shared/payments/invoice4u/process-callback.ts';
import { buildChargeMetadata } from '../../../../supabase/functions/_shared/payments/providers/mock.ts';

const metadata = buildChargeMetadata({
  tenantId: '00000000-0000-0000-0000-0000000000aa',
  engagementId: '00000000-0000-0000-0000-000000001001',
  billingAccountId: '00000000-0000-0000-0000-000000000408',
  offeringId: '00000000-0000-0000-0000-000000000313',
  personId: '00000000-0000-0000-0000-000000000501',
  vatRate: 0.17,
  pretaxMinor: 8500,
  vatMinor: 1500,
  totalMinor: 10000,
});

const ORDER_ID = '11111111-1111-1111-1111-111111111101';
const PAYMENT_ID = '22222222-2222-2222-2222-222222222201';

vi.mock('../../../../supabase/functions/_shared/payments/finalise-payment.ts', () => ({
  finalisePayment: vi.fn(async () => undefined),
}));

vi.mock('../../../../supabase/functions/_shared/payments/bundled-document.ts', () => ({
  applyBundledDocumentNotify: vi.fn(async () => ({ status: 'applied', paymentId: 'pay-1' })),
}));

import { finalisePayment } from '../../../../supabase/functions/_shared/payments/finalise-payment.ts';
import { applyBundledDocumentNotify } from '../../../../supabase/functions/_shared/payments/bundled-document.ts';

type PaymentRow = {
  id: string;
  tenant_id: string;
  engagement_id: string;
  charge_type: string;
  status: string;
  total_amount_minor: number;
  billing_account_id: string;
  person_id: string;
  offering_id: string;
  pretax_amount_minor: number;
  vat_amount_minor: number;
  vat_rate: number;
  currency: string;
  provider_payment_ref: string;
};

function makeCallbackService(initial: PaymentRow) {
  let row: PaymentRow = { ...initial };
  const audits: Array<Record<string, unknown>> = [];
  const tokens: Array<Record<string, unknown>> = [];

  function thenableUpdate(patch: Record<string, unknown>) {
    const run = async () => {
      row = { ...row, ...patch } as PaymentRow;
      return { error: null };
    };
    const builder: {
      eq: () => typeof builder;
      then: (
        resolve: (v: { error: null }) => void,
        reject?: (e: unknown) => void,
      ) => Promise<void>;
    } = {
      eq: () => builder,
      then: (resolve, reject) => run().then(resolve, reject),
    };
    return builder;
  }

  return {
    getRow: () => row,
    audits,
    tokens,
    from(table: string) {
      if (table === 'payments') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => {
                if (val === row.provider_payment_ref || val === row.id) {
                  return { data: { ...row }, error: null };
                }
                return { data: null, error: null };
              },
            }),
          }),
          update: (patch: Record<string, unknown>) => thenableUpdate(patch),
        };
      }
      if (table === 'audit_log') {
        return {
          insert: async (entry: Record<string, unknown>) => {
            audits.push(entry);
            return { error: null };
          },
        };
      }
      if (table === 'payment_method_tokens') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                is: async () => ({ error: null }),
              }),
            }),
          }),
          insert: async (entry: Record<string, unknown>) => {
            tokens.push(entry);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function pendingRow(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'pay-pending-1',
    tenant_id: metadata.tenant_id,
    engagement_id: metadata.engagement_id,
    charge_type: 'initial',
    status: 'pending',
    total_amount_minor: 10000,
    billing_account_id: metadata.billing_account_id,
    person_id: metadata.person_id!,
    offering_id: metadata.offering_id!,
    pretax_amount_minor: 8500,
    vat_amount_minor: 1500,
    vat_rate: 0.17,
    currency: 'ILS',
    provider_payment_ref: ORDER_ID,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(finalisePayment).mockClear();
  vi.mocked(applyBundledDocumentNotify).mockClear();
});

describe('Invoice4U callback parse (U2a)', () => {
  it('peeks OrderIdClientUsage from form Data=', () => {
    const body = buildMockInvoice4uCallbackBody({
      orderIdClientUsage: ORDER_ID,
      paymentId: PAYMENT_ID,
      amountMinor: 10000,
    });
    expect(peekInvoice4uOrderId(body)).toBe(ORDER_ID);
  });

  it('maps success Data= to PaymentEvent + document fields', () => {
    const body = buildMockInvoice4uCallbackBody({
      orderIdClientUsage: ORDER_ID,
      paymentId: PAYMENT_ID,
      amountMinor: 10000,
      cipherText: 'abc',
    });
    const parsed = parseInvoice4uCallback(body, metadata);
    expect(parsed.event.type).toBe('payment.succeeded');
    expect(parsed.paymentId).toBe(PAYMENT_ID);
    expect(parsed.orderIdClientUsage).toBe(ORDER_ID);
    expect(parsed.event.amountMinor).toBe(10000);
    expect(parsed.document?.externalDocumentId).toBe(`doc_${PAYMENT_ID}`);
    expect(parsed.document?.documentUrl).toBe(buildInvoice4uDocumentUrl('abc'));
  });

  it('maps Success=False to payment.failed', () => {
    const body = buildMockInvoice4uCallbackBody({
      orderIdClientUsage: ORDER_ID,
      paymentId: PAYMENT_ID,
      amountMinor: 10000,
      success: false,
      errorMessage: 'Card declined',
    });
    const parsed = parseInvoice4uCallback(body, metadata);
    expect(parsed.event.type).toBe('payment.failed');
    expect(parsed.event.failureMessage).toBe('Card declined');
  });

  it('converts major Amount to minor units', () => {
    expect(minorFromInvoice4uAmount('100.00')).toBe(10000);
    expect(minorFromInvoice4uAmount(12.5)).toBe(1250);
  });
});

describe('processInvoice4uPaymentCallback (U2a)', () => {
  it('upgrades pending → succeeded with PaymentId then finalises and applies doc', async () => {
    const service = makeCallbackService(pendingRow());
    const body = buildMockInvoice4uCallbackBody({
      orderIdClientUsage: ORDER_ID,
      paymentId: PAYMENT_ID,
      amountMinor: 10000,
    });

    const result = await processInvoice4uPaymentCallback(service as never, body);
    expect(result).toEqual({
      paymentId: 'pay-pending-1',
      duplicate: false,
      status: 'succeeded',
    });
    expect(service.getRow().provider_payment_ref).toBe(PAYMENT_ID);
    expect(service.getRow().status).toBe('succeeded');
    expect(finalisePayment).toHaveBeenCalledTimes(1);
    expect(applyBundledDocumentNotify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providerPaymentRef: PAYMENT_ID,
        externalDocumentId: `doc_${PAYMENT_ID}`,
      }),
    );
    expect(service.tokens[0]).toMatchObject({
      provider: 'invoice4u',
      provider_token: '1001',
    });
  });

  it('rejects amount mismatch without finalising (D17)', async () => {
    const service = makeCallbackService(pendingRow());
    const body = buildMockInvoice4uCallbackBody({
      orderIdClientUsage: ORDER_ID,
      paymentId: PAYMENT_ID,
      amountMinor: 9999,
    });

    const result = await processInvoice4uPaymentCallback(service as never, body);
    expect(result.status).toBe('amount_mismatch');
    expect(finalisePayment).not.toHaveBeenCalled();
    expect(applyBundledDocumentNotify).not.toHaveBeenCalled();
    expect(service.audits.some((a) => a.action === 'payment.amount_mismatch')).toBe(true);
    expect(service.getRow().status).toBe('pending');
  });

  it('marks pending failed on Success=False (D18)', async () => {
    const service = makeCallbackService(pendingRow());
    const body = buildMockInvoice4uCallbackBody({
      orderIdClientUsage: ORDER_ID,
      paymentId: PAYMENT_ID,
      amountMinor: 10000,
      success: false,
    });

    const result = await processInvoice4uPaymentCallback(service as never, body);
    expect(result.status).toBe('failed');
    expect(service.getRow().status).toBe('failed');
    expect(finalisePayment).not.toHaveBeenCalled();
  });

  it('replays succeeded PaymentId via PaymentId lookup', async () => {
    const service = makeCallbackService(
      pendingRow({ status: 'succeeded', provider_payment_ref: PAYMENT_ID }),
    );
    const body = buildMockInvoice4uCallbackBody({
      orderIdClientUsage: ORDER_ID,
      paymentId: PAYMENT_ID,
      amountMinor: 10000,
    });

    const result = await processInvoice4uPaymentCallback(service as never, body);
    expect(result.duplicate).toBe(true);
    expect(result.status).toBe('succeeded');
    expect(finalisePayment).toHaveBeenCalledTimes(1);
  });
});
