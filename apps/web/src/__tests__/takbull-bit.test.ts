/**
 * Takbull PR 6: Bit on a phone (PaymentMethodType 21 + IsMobile), the Takbull checkout page,
 * and project payment links. Fake database and fake Takbull only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeSupabase } from '../test/fakeSupabase';
import { buildTakbullOrder, TakbullPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/takbull';
import { MockTakbullApi } from '../../../../supabase/functions/_shared/payments/takbull/mock';
import * as edgePairing from '../../../../supabase/functions/_shared/provider-pairing';
import * as webPairing from '../lib/providerPairing';
import { isHostedPageCheckoutReady, isPhoneBrowser } from '../lib/tenantProviderRouting';

const TENANT = '00000000-0000-4000-8000-0000000000aa';
const ENGAGEMENT = '00000000-0000-4000-8000-0000000000e1';
const BILLING = '00000000-0000-4000-8000-0000000000b1';
const PERSON = '00000000-0000-4000-8000-0000000000c1';

const order = (over: Partial<Parameters<typeof buildTakbullOrder>[0]> = {}) => buildTakbullOrder({
  paymentId: 'p', amountMinor: 30000, currency: 'ILS', language: 'he', documentType: 320,
  payer: { name: 'Parent', email: null, phone: null, identityNumber: null },
  lineName: 'x', ipnUrl: 'i', successUrl: 's', cancelUrl: 'c', ...over,
});

describe('the Bit order', () => {
  it('asks for Bit, and on a phone for the link that opens the Bit app', () => {
    expect(order({ payWith: 'bit', isMobile: true })).toMatchObject({ PaymentMethodType: 21, IsMobile: true, DealType: 1 });
    expect(order({ payWith: 'bit' })).toMatchObject({ PaymentMethodType: 21 });
    expect(order({ payWith: 'bit' })).not.toHaveProperty('IsMobile');
  });

  it('Bit is one payment; the card page keeps instalments', () => {
    expect(order({ payWith: 'bit', isMobile: true, installments: 3 })).not.toHaveProperty('MaxNumberOfPayments');
    expect(order({ installments: 3 })).toMatchObject({ DealType: 2, MaxNumberOfPayments: 3 });
    expect(order()).not.toHaveProperty('PaymentMethodType');
  });
});

describe('createCharge with Bit', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('APP_URL', 'https://studio.test');
  });

  function seed() {
    return makeFakeSupabase({
      tenants: [{ id: TENANT, language_default: 'he', takbull_document_type: 320 }],
      engagements: [{ id: ENGAGEMENT, person_id: PERSON, offering_id: 'off-1' }],
      people: [{ id: PERSON, account_id: null, name: 'Parent', email: null, emergency_contact_phone: null }],
      billing_accounts: [{ id: BILLING, person_id: PERSON, account_id: null, business_tax_id: null }],
      payments: [], takbull_orders: [], audit_log: [],
    });
  }
  const metadata = { tenant_id: TENANT, engagement_id: ENGAGEMENT, billing_account_id: BILLING, charge_type: 'initial' as const };

  it("on a phone the page is Takbull's Bit link; otherwise Takbull's payment page", async () => {
    const { client } = seed();
    const api = new MockTakbullApi();
    const provider = new TakbullPaymentProvider(client as never, async () => api);
    const phone = await provider.createCharge({ amountMinor: 30000, currency: 'ILS', idempotencyKey: 'k', metadata, payWith: 'bit', isMobile: true });
    expect(phone.pageUrl).toMatch(/^bit:\/\/mock\//);
    const card = await provider.createCharge({ amountMinor: 30000, currency: 'ILS', idempotencyKey: 'k2', metadata });
    expect(card.pageUrl).toContain('PaymentGateway?orderUniqId=');
  });
});

describe('where it shows', () => {
  it('Takbull settles project payment links (web and server agree)', () => {
    expect(edgePairing.jobOnlinePaymentSupported('takbull')).toBe(true);
    expect([...webPairing.JOB_ONLINE_PAYMENT_PROVIDERS]).toEqual([...edgePairing.JOB_ONLINE_PAYMENT_PROVIDERS]);
  });

  it("Takbull's page is a hosted-page checkout; Bit is offered on phones only", () => {
    expect(isHostedPageCheckoutReady('takbull', 'https://api.takbull.co.il/PaymentGateway?orderUniqId=x')).toBe(true);
    expect(isHostedPageCheckoutReady('takbull', null)).toBe(false);
    expect(isPhoneBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isPhoneBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(true);
    expect(isPhoneBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
  });
});
