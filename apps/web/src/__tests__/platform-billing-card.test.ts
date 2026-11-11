/**
 * OpalSwift's own billing, step B2: a studio adds its card with the first month's charge on a
 * Takbull page of OpalSwift's account; the notice is checked with Takbull before the payment
 * is recorded and the card saved. Fake database and the mock Takbull only.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeFakeSupabase } from '../test/fakeSupabase';
import {
  buildPlatformCardOrder,
  cardExpiry,
  nextMonth,
  periodMonth,
  processPlatformBillingIpn,
  startPlatformCardSetup,
} from '../../../../supabase/functions/_shared/payments/takbull/platform-billing';
import { MockTakbullApi } from '../../../../supabase/functions/_shared/payments/takbull/mock';

const TENANT = '00000000-0000-4000-8000-0000000000aa';
const NOW = new Date('2026-11-10T10:00:00Z');

beforeEach(() => {
  vi.stubGlobal('Deno', { env: { get: (k: string) => (k === 'SUPABASE_URL' ? 'https://db.example.test' : undefined) } });
});

function seed(extra: Record<string, unknown[]> = {}) {
  return makeFakeSupabase({
    tenants: [{
      id: TENANT, name: 'Lens Studio', contact_email: 'studio@example.test', language_default: 'he',
      legal_profile: { legal_name: 'Lens Studio Ltd', business_number: '515555555', email: 'billing@example.test' },
    }],
    platform_payments: [],
    studio_subscriptions: [],
    ...extra,
  } as Record<string, Array<Record<string, unknown>>>);
}

describe('dates', () => {
  it('pays for the month of the charge, then the first of the next month', () => {
    expect(periodMonth(NOW)).toBe('2026-11-01');
    expect(nextMonth('2026-11-01')).toBe('2026-12-01');
    expect(nextMonth('2026-12-01')).toBe('2027-01-01');
  });
  it('reads the card expiry as MM/YY', () => {
    expect(cardExpiry({ cardTokenExpirationMonth: 3, cardTokenExpirationYear: 2030 })).toBe('03/30');
    expect(cardExpiry({ cardTokenExpirationMonth: 13, cardTokenExpirationYear: 30 })).toBeNull();
  });
});

describe('the order', () => {
  it('is a regular card deal on OpalSwift\'s page, named pb_<id>, with a receipt', () => {
    const order = buildPlatformCardOrder({
      paymentId: 'p1', amountAgorot: 100, language: 'he',
      payer: { name: 'Lens Studio Ltd', email: 'b@x.test', businessNumber: '515555555' },
      documentType: 400, ipnUrl: 'https://ipn', successUrl: 'https://ok', cancelUrl: 'https://no',
    });
    expect(order).toMatchObject({
      order_reference: 'pb_p1', OrderTotalSum: 1, DealType: 1, CreateDocument: true, DocumentType: 400,
      IPNAddress: 'https://ipn', RedirectAddress: 'https://ok', CancelReturnAddress: 'https://no', Currency: 'ILS',
      Customer: { CustomerFullName: 'Lens Studio Ltd', Email: 'b@x.test', IdentityNumber: '515555555' },
    });
  });
});

describe('adding a card', () => {
  it('records a pending ₪1 charge for this month and opens Takbull\'s page', async () => {
    const { db, client } = seed();
    const api = new MockTakbullApi();
    const r = await startPlatformCardSetup(client as never, { tenantId: TENANT, returnBaseUrl: 'https://lens.example.test/', now: NOW }, { api });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.amountAgorot).toBe(100);
    expect(r.url).toContain('PaymentGateway?orderUniqId=');
    const row = db.tables.platform_payments[0];
    expect(row).toMatchObject({ tenant_id: TENANT, period_month: '2026-11-01', attempt: 1, amount_agorot: 100, status: 'pending' });
    expect(row.takbull_order_ref).toBeTruthy();
    const order = api.orders.get(row.takbull_order_ref as string);
    expect(order?.order_reference).toBe(`pb_${row.id}`);
    expect(order?.IPNAddress).toBe('https://db.example.test/functions/v1/platform-billing-ipn');
    expect(order?.RedirectAddress).toBe('https://lens.example.test/admin/setup/payments?plan_card=done');
    expect(order?.Customer?.IdentityNumber).toBe('515555555');
  });

  it('charges the studio\'s monthly price when one is set, as the next attempt', async () => {
    const { db, client } = seed({
      studio_subscriptions: [{ tenant_id: TENANT, monthly_amount_agorot: 9900 }],
      platform_payments: [{ id: 'old', tenant_id: TENANT, period_month: '2026-11-01', attempt: 1, amount_agorot: 9900, status: 'failed' }],
    });
    const r = await startPlatformCardSetup(client as never, { tenantId: TENANT, returnBaseUrl: 'https://x', now: NOW }, { api: new MockTakbullApi() });
    expect(r.ok && r.amountAgorot).toBe(9900);
    expect(db.tables.platform_payments.find((p) => p.id !== 'old')).toMatchObject({ attempt: 2, amount_agorot: 9900 });
  });

  it('does not charge a month that is already paid', async () => {
    const { client } = seed({
      platform_payments: [{ id: 'paid', tenant_id: TENANT, period_month: '2026-11-01', attempt: 1, amount_agorot: 100, status: 'succeeded' }],
    });
    const r = await startPlatformCardSetup(client as never, { tenantId: TENANT, returnBaseUrl: 'https://x', now: NOW }, { api: new MockTakbullApi() });
    expect(r).toEqual({ ok: false, code: 'already_paid' });
  });

  it('marks the attempt failed when Takbull refuses the page', async () => {
    const { db, client } = seed();
    const r = await startPlatformCardSetup(client as never, { tenantId: TENANT, returnBaseUrl: 'https://x', now: NOW }, { api: new MockTakbullApi('invalid-key') });
    expect(r.ok).toBe(false);
    expect(db.tables.platform_payments[0].status).toBe('failed');
  });
});

describe('the payment notice', () => {
  async function started() {
    const fake = seed();
    const api = new MockTakbullApi();
    await startPlatformCardSetup(fake.client as never, { tenantId: TENANT, returnBaseUrl: 'https://x', now: NOW }, { api });
    const row = fake.db.tables.platform_payments[0];
    const uniqId = row.takbull_order_ref as string;
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    (fake.client as unknown as { rpc: typeof rpc }).rpc = rpc;
    const ipn = {
      uniqId, orderReference: `pb_${row.id}`, statusCode: 0, statusDescription: 'OK', action: null,
      transactionInternalNumber: api.transactionNumberFor(uniqId) as string,
    };
    return { ...fake, api, row, ipn, rpc };
  }

  it('records the payment and saves the card, after Takbull confirms it', async () => {
    const { client, api, row, ipn, rpc } = await started();
    const r = await processPlatformBillingIpn(client as never, ipn, { api });
    expect(r).toEqual({ status: 'succeeded', paymentId: row.id, duplicate: false });
    expect(row.status).toBe('succeeded');
    expect(row.takbull_transaction_id).toBe(ipn.transactionInternalNumber);
    expect(rpc).toHaveBeenCalledWith('save_studio_card_token', expect.objectContaining({
      p_tenant_id: TENANT, p_last4: '4242', p_expiry: '12/30', p_next_charge_on: '2026-12-01',
    }));
    // A second notice changes nothing.
    const again = await processPlatformBillingIpn(client as never, ipn, { api });
    expect(again).toMatchObject({ status: 'succeeded', duplicate: true });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('saves nothing when Takbull does not know the order', async () => {
    const { client, row, ipn, rpc } = await started();
    const r = await processPlatformBillingIpn(client as never, ipn, { api: new MockTakbullApi() });
    expect(r.status).toBe('unverified');
    expect(row.status).toBe('pending');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('saves nothing when the amount is not ours', async () => {
    const { client, api, row, ipn, rpc } = await started();
    api.transactions.get(ipn.transactionInternalNumber)!.amount = 50;
    const r = await processPlatformBillingIpn(client as never, ipn, { api });
    expect(r.status).toBe('amount_mismatch');
    expect(row.status).toBe('pending');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('marks a declined charge failed', async () => {
    const { client, api, row, ipn } = await started();
    api.transactions.get(ipn.transactionInternalNumber)!.status = 2;
    const r = await processPlatformBillingIpn(client as never, ipn, { api });
    expect(r.status).toBe('failed');
    expect(row.status).toBe('failed');
  });

  it('ignores a notice for an order that is not OpalSwift\'s', async () => {
    const { client, api, ipn } = await started();
    const r = await processPlatformBillingIpn(client as never, { ...ipn, orderReference: 'some-studio-payment', uniqId: 'other' }, { api });
    expect(r).toEqual({ status: 'unknown_order' });
  });
});
