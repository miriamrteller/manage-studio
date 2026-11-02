/**
 * Business status must not change what we send to Grow (payments audit P1 #3): no VAT type,
 * the amount exactly as entered, the tax ID passed through only when set. Fake DB, no network.
 * Run: pnpm -C apps/web test grow-no-vat-type.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/grow.ts';
import { buildChargeMetadata } from '../../../../supabase/functions/_shared/payments/providers/mock.ts';
import { makeGrowFakeService } from './helpers/growFakeService';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
const ENGAGEMENT = '11111111-1111-1111-1111-111111111111';

function metadata(chargeType: 'initial' | 'renewal') {
  return buildChargeMetadata({
    tenantId: TENANT,
    engagementId: ENGAGEMENT,
    billingAccountId: '22222222-2222-2222-2222-222222222222',
    offeringId: '33333333-3333-3333-3333-333333333333',
    personId: '44444444-4444-4444-4444-444444444444',
    vatRate: 0,
    pretaxMinor: 0,
    vatMinor: 0,
    totalMinor: 12345,
    chargeType,
  });
}

function provider(tenant: Record<string, unknown>) {
  const { service } = makeGrowFakeService({
    tables: {
      tenants: [{ id: TENANT, payment_provider_account_id: 'grow_user_1', ...tenant }],
      engagements: [{ id: ENGAGEMENT, tenant_id: TENANT, person_id: 'p-1', offering_id: 'o-1' }],
    },
  });
  return new GrowPaymentProvider(service);
}

async function sentBody(tenant: Record<string, unknown>, savedToken?: string) {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ status: 1, data: { url: 'https://grow.test/pay/1' } }), { status: 200 }),
  );
  await provider(tenant).createCharge({
    amountMinor: 12345,
    currency: 'ILS',
    idempotencyKey: `idem-${savedToken ?? 'hosted'}-${Math.random()}`,
    metadata: metadata(savedToken ? 'renewal' : 'initial'),
    ...(savedToken ? { savedToken } : {}),
  });
  const [, init] = fetchSpy.mock.calls[0];
  return JSON.parse((init as { body: string }).body) as Record<string, unknown>;
}

beforeEach(() => vi.stubEnv('GROW_API_BASE', 'https://grow.test/api/light/server/1.0'));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe.each([
  ['hosted page', undefined],
  ['saved-card renewal', 'tok_abc'],
])('Grow %s charge', (_label, savedToken) => {
  it('sends no VAT type, whatever the old vat_type column says', async () => {
    for (const vat_type of [1, 2, 3, null]) {
      const body = await sentBody({ vat_type }, savedToken);
      expect(Object.keys(body).some((k) => /vat/i.test(k))).toBe(false);
      vi.restoreAllMocks();
    }
  });

  it('sends the amount exactly as entered (gross, never split)', async () => {
    const body = await sentBody({ vat_type: 3 }, savedToken);
    expect(body.sum).toBe('123.45');
  });

  it('passes the tax ID through only when set, and never an allocation number', async () => {
    const withId = await sentBody({ invoice_license_number: '123456789' }, savedToken);
    expect(withId['pageField[invoiceLicenseNumber]']).toBe('123456789');
    vi.restoreAllMocks();
    const withoutId = await sentBody({ invoice_license_number: null }, savedToken);
    expect('pageField[invoiceLicenseNumber]' in withoutId).toBe(false);
    expect(Object.keys(withoutId).some((k) => /allocation/i.test(k))).toBe(false);
  });
});
