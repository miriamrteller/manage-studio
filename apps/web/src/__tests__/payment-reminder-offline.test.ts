/**
 * Payment reminders for an offline-only studio carry the studio's own instructions and
 * no checkout link (there is no checkout that could take the money).
 * Run: pnpm -C apps/web test payment-reminder-offline.test.ts
 */
import { describe, it, expect } from 'vitest';
import { renderPaymentReminderHtml } from '../../../../supabase/functions/_shared/render-payment-email.ts';
import { buildEnrolmentUnpaidEmailCopy } from '../../../../supabase/functions/_shared/collections/build-dunning-email-context.ts';

const base = {
  schoolName: 'Creative Ballet Academy',
  recipientName: 'Parent',
  amountFormatted: '₪350',
  className: 'Ballet 1',
  dueDate: '08/11/2026',
  paymentUrl: 'https://creativeballet.example/enrol/pay/e1?t=secret',
  description: 'Student — Ballet 1',
  primaryColor: '#123456',
  accentColor: '#654321',
};

describe('renderPaymentReminderHtml (offline studio)', () => {
  it.each(['en', 'he'] as const)('%s: replaces the pay button and link with the instructions', (language) => {
    const html = renderPaymentReminderHtml({
      ...base,
      language,
      offline: { instructions: 'Bank Hapoalim 12-345-678\nor cash at the first lesson' },
    });
    expect(html).not.toContain('enrol/pay');
    expect(html).not.toContain(language === 'he' ? 'בצע תשלום' : 'Make Payment');
    expect(html).not.toContain(language === 'he' ? 'אנא היכנס לחשבונך' : 'Please log in to your account');
    expect(html).toContain(language === 'he' ? 'איך משלמים' : 'How to pay');
    expect(html).toContain('Bank Hapoalim 12-345-678<br/>or cash at the first lesson');
  });

  it('escapes studio-written instructions', () => {
    const html = renderPaymentReminderHtml({
      ...base,
      language: 'en',
      offline: { instructions: '<script>alert(1)</script> & "quotes"' },
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;');
  });

  it('falls back to a generic line when the studio wrote no instructions', () => {
    const html = renderPaymentReminderHtml({ ...base, language: 'en', offline: { instructions: null } });
    expect(html).toContain('Please pay at the studio in cash or by bank transfer');
  });

  it('keeps the pay button for studios with an online provider', () => {
    const html = renderPaymentReminderHtml({ ...base, language: 'en' });
    expect(html).toContain('Make Payment');
    expect(html).toContain('enrol/pay');
  });
});

describe('buildEnrolmentUnpaidEmailCopy', () => {
  it('points offline studios to paying at the studio, not to a link', () => {
    for (const language of ['en', 'he'] as const) {
      const offline = buildEnrolmentUnpaidEmailCopy({
        language,
        className: 'Ballet 1',
        studentName: 'Dana',
        attemptCount: 1,
        dueDate: 'x',
        offline: true,
      });
      const online = buildEnrolmentUnpaidEmailCopy({
        language,
        className: 'Ballet 1',
        studentName: 'Dana',
        attemptCount: 1,
        dueDate: 'x',
      });
      expect(offline.intro).not.toBe(online.intro);
      expect(offline.intro).toContain(language === 'he' ? 'בסטודיו' : 'at the studio');
      expect(offline.intro).not.toContain(language === 'he' ? 'בקישור' : 'link');
    }
  });
});
