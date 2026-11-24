import { describe, expect, it } from 'vitest';
import { payErrorText } from '@/features/jobs/lib/jobPaymentFormat';

const t = (key: string, opts?: Record<string, string>) => (opts?.studio ? `${key}|${opts.studio}` : key);

describe('payErrorText (client pay page)', () => {
  it('never shows a raw "Internal error"', () => {
    expect(payErrorText('Internal error', 'Studio', t)).toBe('pages.pay.pageUnavailable|Studio');
  });

  it('explains a refused card page and names the studio', () => {
    expect(payErrorText('payment_page_unavailable', 'Studio', t)).toBe('pages.pay.pageUnavailable|Studio');
  });

  it('keeps the pay-the-studio message when online payment is off', () => {
    expect(payErrorText('online_payment_unavailable', 'Studio', t)).toBe('pages.pay.payStudioDirectly|Studio');
  });

  it('says the request can no longer be paid when it is closed', () => {
    expect(payErrorText('Request is paid', 'Studio', t)).toBe('pages.pay.notCollectable');
  });
});
