/**
 * I4-mock-parity: iCount IPN parser maps official field shapes to canonical PaymentEvent.
 * Run: pnpm -C apps/web test icount-ipn-parse.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  encodeIcountIpnBody,
  isJsonPaymentEventBody,
  parseIcountIpn,
} from '../../../../supabase/functions/_shared/payments/icount/ipn.ts';

const enrolmentFixture = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '../../../../docs/plans/finance/icount/fixtures/icount-ipn-enrolment-mock.json',
    ),
    'utf8',
  ),
) as Record<string, string | number>;

const renewalFixture = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '../../../../docs/plans/finance/icount/fixtures/icount-ipn-renewal-mock.json',
    ),
    'utf8',
  ),
) as Record<string, string | number>;

function fixtureToIpnBody(fields: Record<string, string | number>): string {
  const { _comment, ...rest } = fields as Record<string, string | number> & { _comment?: string };
  void _comment;
  return encodeIcountIpnBody(rest);
}

describe('parseIcountIpn', () => {
  it('maps enrolment fixture fields to PaymentEvent', () => {
    const event = parseIcountIpn(fixtureToIpnBody(enrolmentFixture));

    expect(event.type).toBe('payment.succeeded');
    expect(event.providerPaymentRef).toBe('mockicount_enrol_abc123');
    expect(event.amountMinor).toBe(35000);
    expect(event.currency).toBe('ILS');
    expect(event.metadata.charge_type).toBe('initial');
    expect(event.metadata.tenant_id).toBe(enrolmentFixture.tenant_id);
    expect(event.metadata.engagement_id).toBe(enrolmentFixture.engagement_id);
  });

  it('maps renewal fixture with billing_schedule_id', () => {
    const event = parseIcountIpn(fixtureToIpnBody(renewalFixture));

    expect(event.metadata.charge_type).toBe('renewal');
    expect(event.metadata.billing_schedule_id).toBe(renewalFixture.billing_schedule_id);
    expect(event.providerPaymentRef).toBe(renewalFixture.confirmation_code);
  });

  it('rejects JSON PaymentEvent blobs', () => {
    expect(isJsonPaymentEventBody('{"type":"payment.succeeded","providerPaymentRef":"x"}')).toBe(
      true,
    );
    expect(() =>
      parseIcountIpn('{"type":"payment.succeeded","providerPaymentRef":"x"}'),
    ).toThrow(/rejected JSON PaymentEvent/i);
  });

  it('rejects Grow notify bodies', () => {
    const body = encodeIcountIpnBody({
      transactionId: '999',
      sum: 100,
      currency_code: 'ILS',
    });
    expect(() => parseIcountIpn(body)).toThrow(/Grow notify/i);
  });

  it('requires confirmation_code', () => {
    const body = encodeIcountIpnBody({ sum: 100, currency_code: 'ILS', tenant_id: 't' });
    expect(() => parseIcountIpn(body)).toThrow(/confirmation_code/i);
  });
});
