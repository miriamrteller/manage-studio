/**
 * Photographer automatic emails — variable building, Jerusalem formatting,
 * and the pre-rendered Deno shells (supabase/functions/_shared/photographer-*).
 */
import { describe, expect, it } from 'vitest';
import {
  bookingConfirmedVariables,
  dueShootEmailVariables,
  isSafeLink,
  type DueShootEmail,
} from '../../../../supabase/functions/_shared/photographer-emails/variables.ts';
import {
  formatCalendarDate,
  formatInstantTime,
} from '../../../../supabase/functions/_shared/photographer-emails/format.ts';
import {
  isPhotographerEmailKey,
  PHOTOGRAPHER_EMAIL_KEYS,
  renderPhotographerEmail,
  selectPhotographerEmailVariant,
} from '../../../../supabase/functions/_shared/photographer-emails/render.ts';
import { PHOTOGRAPHER_EMAIL_VARIABLES } from '../../../../supabase/functions/_shared/photographer-email-shells/generated.ts';

const due = (over: Partial<DueShootEmail>): DueShootEmail => ({
  email_key: 'shoot_reminder',
  tenant_id: 't',
  engagement_id: 'e',
  recipient_email: 'dana@example.test',
  recipient_name: 'Dana',
  shoot_starts_at: '2026-11-20T15:30:00Z',
  location: 'Jaffa Port',
  gallery_url: null,
  offering_name: 'Family session',
  ...over,
});

describe('formatting (Asia/Jerusalem)', () => {
  it('renders shoot time in Jerusalem wall-clock (UTC+2 in November)', () => {
    expect(formatInstantTime('2026-11-20T15:30:00Z', 'en')).toBe('17:30');
  });

  it('keeps a bare calendar date on the same day', () => {
    expect(formatCalendarDate('2026-11-20', 'en')).toBe('20 November 2026');
    expect(formatCalendarDate(null, 'he')).toBe('—');
  });
});

describe('bookingConfirmedVariables', () => {
  it('formats money from minor units and passes the quote link through', () => {
    const vars = bookingConfirmedVariables(
      {
        ok: true, total_minor: 225000, deposit_minor: 67500, balance_minor: 157500, currency: 'ILS',
        shoot_date: '2026-11-20', balance_due_date: '2026-11-20',
      },
      { recipientName: 'Dana', quoteUrl: 'https://a.example.test/quote/x', language: 'en' },
    );
    expect(vars.totalFormatted).toContain('2,250');
    expect(vars.depositFormatted).toContain('675');
    expect(vars.balanceFormatted).toContain('1,575');
    expect(vars.shootDate).toBe('20 November 2026');
    expect(vars.quoteUrl).toBe('https://a.example.test/quote/x');
  });

  it('falls back to a polite Hebrew salutation without a name', () => {
    const vars = bookingConfirmedVariables({ ok: true }, { recipientName: null, quoteUrl: '#', language: 'he' });
    expect(vars.recipientName).toBe('לקוח/ה יקר/ה');
    expect(vars.totalFormatted).toBe('—');
  });
});

describe('dueShootEmailVariables', () => {
  it('reminder carries date, time and location', () => {
    expect(dueShootEmailVariables(due({}), 'en')).toMatchObject({
      recipientName: 'Dana', shootTime: '17:30', location: 'Jaffa Port',
    });
  });

  it('gallery email carries the gallery link', () => {
    const vars = dueShootEmailVariables(
      due({ email_key: 'gallery_ready', gallery_url: 'https://gallery.example.test/x' }),
      'he',
    );
    expect(vars.galleryUrl).toBe('https://gallery.example.test/x');
  });

  it('only accepts http(s) gallery links', () => {
    expect(isSafeLink('https://g.example.test')).toBe(true);
    expect(isSafeLink('javascript:alert(1)')).toBe(false);
    expect(isSafeLink(null)).toBe(false);
  });
});

describe('photographer email shells', () => {
  it('covers the fixed set of five emails', () => {
    expect([...PHOTOGRAPHER_EMAIL_KEYS].sort()).toEqual(Object.keys(PHOTOGRAPHER_EMAIL_VARIABLES).sort());
    expect(isPhotographerEmailKey('quote_sent')).toBe(true);
    expect(isPhotographerEmailKey('welcome')).toBe(false);
  });

  it.each(PHOTOGRAPHER_EMAIL_KEYS)('%s renders in Hebrew RTL with no leftover placeholders', (key) => {
    const variables = Object.fromEntries(PHOTOGRAPHER_EMAIL_VARIABLES[key].map((name) => [name, `v-${name}`]));
    const { html, subject } = renderPhotographerEmail({
      key, language: 'he', schoolName: 'סטודיו', primaryColor: '#123456', accentColor: '#654321', variables,
    });
    expect(html).toContain('dir="rtl"');
    expect(html).not.toMatch(/\{\{MS_[A-Z_]+\}\}/);
    expect(html).not.toContain('var(--email-');
    expect(html).toContain('v-recipientName');
    expect(subject).toContain('סטודיו');
    expect(subject).not.toContain('{schoolName}');
  });

  it('escapes HTML in values', () => {
    const { html } = renderPhotographerEmail({
      key: 'shoot_thank_you', language: 'en', schoolName: 'A&B', primaryColor: '#000', accentColor: '#fff',
      variables: { recipientName: '<script>x</script>' },
    });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A&amp;B');
  });

  it('quote_sent puts the quote link on the button', () => {
    const { html } = renderPhotographerEmail({
      key: 'quote_sent', language: 'en', schoolName: 'S', primaryColor: '#000', accentColor: '#fff',
      variables: { recipientName: 'D', quoteUrl: 'https://s.example.test/quote/abc' },
    });
    expect(html).toContain('href="https://s.example.test/quote/abc"');
  });
});

describe('booking_confirmed next steps (sign the contract, then pay the deposit)', () => {
  const base = {
    ok: true, total_minor: 100000, deposit_minor: 30000, balance_minor: 70000, currency: 'ILS',
    shoot_date: '2026-11-20', balance_due_date: '2026-11-20',
  };
  const SIGN = 'https://s.example.test/enrol/complete?engagementId=e1&wt=tok.sig';
  const PAY = 'https://s.example.test/pay/abc123';
  const render = (signUrl: string | null, payUrl: string | null, language: 'en' | 'he' = 'en') =>
    renderPhotographerEmail({
      key: 'booking_confirmed', language, schoolName: 'S', primaryColor: '#000', accentColor: '#fff',
      variables: bookingConfirmedVariables(base, {
        recipientName: 'Dana', quoteUrl: 'https://s.example.test/quote/q', language, signUrl, payUrl,
      }),
    }).html;

  it('includes both links, signing first', () => {
    const html = render(SIGN, PAY);
    const sign = html.indexOf(`href="${SIGN.replace(/&/g, '&amp;')}"`);
    const pay = html.indexOf(`href="${PAY}"`);
    expect(sign).toBeGreaterThan(-1);
    expect(pay).toBeGreaterThan(sign);
    expect(html).toContain('1. Sign the contract.');
    expect(html).toMatch(/2\. Pay the deposit of .*300/);
    expect(html).not.toContain('Payment details will follow in a separate message.');
    expect(html).not.toMatch(/\{\{MS_[A-Z_]+\}\}/);
  });

  it('Hebrew keeps the same order', () => {
    const html = render(SIGN, PAY, 'he');
    expect(html).toContain('dir="rtl"');
    expect(html.indexOf('לחתימה על החוזה')).toBeGreaterThan(-1);
    expect(html.indexOf('לתשלום המקדמה')).toBeGreaterThan(html.indexOf('לחתימה על החוזה'));
  });

  it('no contract template → only the pay step', () => {
    const html = render(null, PAY);
    expect(html).toContain(`href="${PAY}"`);
    expect(html).toContain('1. Pay the deposit of');
    expect(html).not.toContain('Sign the contract');
  });

  it('no links → today\'s email, unchanged', () => {
    const html = render(null, null);
    expect(html).toContain('Payment details will follow in a separate message.');
    expect(html).not.toContain('Sign the contract');
    expect(html).not.toContain('Pay the deposit');
  });

  it('drops unsafe links instead of putting them on a button', () => {
    const vars = bookingConfirmedVariables(base, {
      recipientName: 'D', quoteUrl: '#', language: 'en', signUrl: 'javascript:alert(1)', payUrl: PAY,
    });
    expect(vars.signUrl).toBeUndefined();
    expect(selectPhotographerEmailVariant('booking_confirmed', vars)).toBe('pay');
  });

  it('picks the variant from the optional variables that are set', () => {
    expect(selectPhotographerEmailVariant('booking_confirmed', { signUrl: 'x', payUrl: 'y' })).toBe('sign_pay');
    expect(selectPhotographerEmailVariant('booking_confirmed', { signUrl: 'x' })).toBe('sign');
    expect(selectPhotographerEmailVariant('booking_confirmed', {})).toBeNull();
    expect(selectPhotographerEmailVariant('quote_sent', { signUrl: 'x' })).toBeNull();
  });
});
