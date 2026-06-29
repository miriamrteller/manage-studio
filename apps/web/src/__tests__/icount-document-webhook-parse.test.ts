/**
 * I2a: iCount document webhook parser — official fixture + mutual rejection with Grow.
 * Run: pnpm -C apps/web test icount-document-webhook-parse.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseIcountDocumentWebhook,
  peekIcountDocumentPaymentRef,
} from '../../../../supabase/functions/_shared/payments/icount/document.ts';
import { parseGrowInvoiceNotify } from '../../../../supabase/functions/_shared/payments/providers/grow.ts';
import icountDocumentFixture from './fixtures/icount-document-webhook-official-example.json';
import growInvoiceNotify from './fixtures/grow-invoice-notify.json';

const ICOUNT_TENANT = '00000000-0000-0000-0000-0000000000bb';
const PAYMENT_REF = '455544545';

describe('parseIcountDocumentWebhook', () => {
  it('parses the official help-center document webhook fixture', () => {
    const parsed = parseIcountDocumentWebhook(icountDocumentFixture, ICOUNT_TENANT);

    expect(parsed.tenantId).toBe(ICOUNT_TENANT);
    expect(parsed.providerPaymentRef).toBe(PAYMENT_REF);
    expect(parsed.externalDocumentId).toBe('invrec_3006');
    expect(parsed.externalDocumentNumber).toBe('3006');
    expect(parsed.documentUrl).toContain('https://');
  });

  it('prefers deal_id over cc_shovar when both are present', () => {
    const body = [
      {
        doctype: 'invrec',
        docnum: '42',
        pdf_link: 'https://example.com/doc.pdf',
        cc_payments: [{ deal_id: 'deal_primary', cc_shovar: 'shovar_fallback' }],
      },
    ];
    expect(peekIcountDocumentPaymentRef(body)).toBe('deal_primary');
  });

  it('falls back to cc_shovar when deal_id is empty (Risk #22)', () => {
    expect(peekIcountDocumentPaymentRef(icountDocumentFixture)).toBe(PAYMENT_REF);
  });

  it('throws on empty array', () => {
    expect(() => parseIcountDocumentWebhook([], ICOUNT_TENANT)).toThrow();
  });
});

describe('mutual parser rejection', () => {
  it('rejects Grow invoice notify body in iCount parser', () => {
    expect(() =>
      parseIcountDocumentWebhook(growInvoiceNotify as unknown, ICOUNT_TENANT),
    ).toThrow();
  });

  it('rejects iCount document array in Grow parser', () => {
    expect(() =>
      parseGrowInvoiceNotify(icountDocumentFixture as unknown as Record<string, unknown>),
    ).toThrow();
  });
});

describe('Tax Delegation guard (#16)', () => {
  it('document.ts contains no hardcoded VAT computation expressions', () => {
    const path = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../supabase/functions/_shared/payments/icount/document.ts',
    );
    const src = readFileSync(path, 'utf8');
    const forbidden = [/\/\s*1\.17/, /\*\s*0\.17/, /vat_rate\s*=\s*0\./, /tax_rate\s*=/];

    for (const pattern of forbidden) {
      expect(src).not.toMatch(pattern);
    }
  });
});
