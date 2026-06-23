/**
 * G4a/G4b: Grow notify fixtures parse into a canonical PaymentEvent and document fields.
 * Run: pnpm -C apps/web test grow-webhook-parse.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  parseGrowNotify,
  parseGrowInvoiceNotify,
} from '../../../../supabase/functions/_shared/payments/providers/grow.ts';
import paymentNotify from './fixtures/grow-payment-notify.json';
import invoiceNotify from './fixtures/grow-invoice-notify.json';

describe('parseGrowNotify', () => {
  it('maps an approved payment notify to a succeeded PaymentEvent', () => {
    const { event, transactionId, transactionToken, paymentType } = parseGrowNotify(
      paymentNotify as Record<string, unknown>,
    );

    expect(event.type).toBe('payment.succeeded');
    expect(event.providerPaymentRef).toBe('idem_11111111-1111-1111-1111-111111111111');
    expect(event.amountMinor).toBe(35000);
    expect(event.pretaxAmountMinor).toBe(29915);
    expect(event.vatAmountMinor).toBe(5085);
    expect(event.metadata.tenant_id).toBe('00000000-0000-0000-0000-0000000000aa');
    expect(event.metadata.charge_type).toBe('initial');

    expect(transactionId).toBe('9988776');
    expect(transactionToken).toBe('tok_sandbox_redacted');
    expect(paymentType).toBe('1');
  });

  it('maps a non-approved status to a failed PaymentEvent', () => {
    const declined = { ...(paymentNotify as Record<string, unknown>), status: 0 };
    const { event } = parseGrowNotify(declined);
    expect(event.type).toBe('payment.failed');
    expect(event.failureMessage).toBeTruthy();
  });
});

describe('parseGrowInvoiceNotify', () => {
  it('extracts the routing keys and document fields', () => {
    const parsed = parseGrowInvoiceNotify(invoiceNotify as Record<string, unknown>);
    expect(parsed.tenantId).toBe('00000000-0000-0000-0000-0000000000aa');
    expect(parsed.providerPaymentRef).toBe('idem_11111111-1111-1111-1111-111111111111');
    expect(parsed.externalDocumentId).toBe('DOC-555000');
    expect(parsed.externalDocumentNumber).toBe('INV-2026-0042');
    expect(parsed.documentUrl).toContain('https://');
  });

  it('throws when the document id is missing', () => {
    const broken = { data: { cField1: 'x', transactionUniqueIdentifier: 'y' } };
    expect(() => parseGrowInvoiceNotify(broken)).toThrow();
  });
});
