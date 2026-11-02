/**
 * G6: Grow recurring renewals charge a saved card token and round-trip billing_schedule_id.
 * Run: pnpm -C apps/web test grow-renewal-charge.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/grow.ts';
import { MockGrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-grow.ts';
import { buildChargeMetadata } from '../../../../supabase/functions/_shared/payments/providers/mock.ts';
import { makeGrowFakeService } from './helpers/growFakeService';

const renewalMetadata = buildChargeMetadata({
  tenantId: '00000000-0000-0000-0000-0000000000aa',
  engagementId: '11111111-1111-1111-1111-111111111111',
  billingAccountId: '22222222-2222-2222-2222-222222222222',
  offeringId: '33333333-3333-3333-3333-333333333333',
  personId: '44444444-4444-4444-4444-444444444444',
  vatRate: 0.17,
  pretaxMinor: 29915,
  vatMinor: 5085,
  totalMinor: 35000,
  chargeType: 'renewal',
  billingScheduleId: '55555555-5555-5555-5555-555555555555',
});

function makeService() {
  return makeGrowFakeService({
    tables: {
      tenants: [{ id: renewalMetadata.tenant_id, payment_provider_account_id: 'grow_user_1' }],
      engagements: [
        {
          id: renewalMetadata.engagement_id,
          tenant_id: renewalMetadata.tenant_id,
          person_id: '44444444-4444-4444-4444-444444444444',
          offering_id: '33333333-3333-3333-3333-333333333333',
        },
      ],
    },
  });
}

beforeEach(() => vi.stubEnv('GROW_API_BASE', 'https://grow.test/api/light/server/1.0'));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('GrowPaymentProvider renewal token charge', () => {
  it('uses createTransactionWithToken and round-trips billing_schedule_id', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ status: 1 }), { status: 200 }));

    const { service, tables } = makeService();
    const provider = new GrowPaymentProvider(service);
    const result = await provider.createCharge({
      amountMinor: 35000,
      currency: 'ILS',
      idempotencyKey: 'renew-2026-06',
      metadata: renewalMetadata,
      savedToken: 'saved_token_abc',
    });

    expect(result.pendingWebhook).toBe(true);
    expect(result.providerPaymentRef).toBe('renew-2026-06');
    // A pending row is written first, so the notify can be checked against it.
    expect(tables.payments).toHaveLength(1);
    expect(tables.payments[0]).toMatchObject({
      provider: 'grow',
      provider_payment_ref: 'renew-2026-06',
      status: 'pending',
      total_amount_minor: 35000,
      charge_type: 'renewal',
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('createTransactionWithToken');
    const body = JSON.parse((init as { body?: string }).body as string);
    expect(body.token).toBe('saved_token_abc');
    expect(body.transactionUniqueIdentifier).toBe('renew-2026-06');
    // billing_schedule_id is packed into cField4 so the notify webhook can rebuild metadata.
    expect(body.cField4).toContain('55555555-5555-5555-5555-555555555555');
  });

  it('throws when the token charge is not approved', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 0, err: { message: 'token expired' } }), { status: 200 }),
    );
    const { service, tables } = makeService();
    const provider = new GrowPaymentProvider(service);
    await expect(
      provider.createCharge({
        amountMinor: 35000,
        currency: 'ILS',
        idempotencyKey: 'renew-2026-06',
        metadata: renewalMetadata,
        savedToken: 'expired',
      }),
    ).rejects.toThrow(/token expired/i);
    // Grow refused, so no notify will come: the pending row is closed as failed.
    expect(tables.payments[0]).toMatchObject({ status: 'failed' });
  });
});

describe('MockGrowPaymentProvider renewal', () => {
  it('emits a sync event whose metadata carries billing_schedule_id', async () => {
    const provider = new MockGrowPaymentProvider();
    const result = await provider.createCharge({
      amountMinor: 35000,
      currency: 'ILS',
      idempotencyKey: 'renew-mock',
      metadata: renewalMetadata,
      savedToken: 'saved_token_abc',
    });

    expect(result.emitSyncEvent?.type).toBe('payment.succeeded');
    expect(result.emitSyncEvent?.metadata.billing_schedule_id).toBe(
      '55555555-5555-5555-5555-555555555555',
    );
  });
});
