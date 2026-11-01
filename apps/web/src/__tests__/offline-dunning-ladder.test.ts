/**
 * Owner decision 2026-11-01: pay-at-the-studio places auto-cancel after 30 days unpaid
 * (reminders on day 14 and 25, with the studio's instructions); card payers stay at 3 / 7 / 14.
 * Run: pnpm -C apps/web test offline-dunning-ladder.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ENROLMENT_DUNNING_DAY_OFFSETS,
  OFFLINE_ENROLMENT_DUNNING_DAY_OFFSETS,
  dunningLadderFor,
  enrolmentDunningActionDueAt,
  jerusalemMidnightIso,
  resolveEnrolmentDunningDueAttempt,
} from '../../../../supabase/functions/_shared/collections/enrolment-dunning-time.ts';
import { applyEnrolmentPaymentDunningStep } from '../../../../supabase/functions/_shared/collections/apply-enrolment-payment-dunning-step.ts';
import { buildEnrolmentUnpaidEmailCopy } from '../../../../supabase/functions/_shared/collections/build-dunning-email-context.ts';
import { renderPaymentReminderHtml } from '../../../../supabase/functions/_shared/render-payment-email.ts';

const CREATED = '2026-06-01T10:00:00.000Z';
const day = (n: number) => new Date(Date.parse(jerusalemMidnightIso('2026-06-01')) + n * 86400000 + 3600000);

afterEach(() => vi.useRealTimers());

describe('dunning ladders: 30 days offline vs 14 days card', () => {
  it('picks the ladder from the payment provider', () => {
    expect(ENROLMENT_DUNNING_DAY_OFFSETS).toEqual([3, 7, 14]);
    expect(OFFLINE_ENROLMENT_DUNNING_DAY_OFFSETS).toEqual([14, 25, 30]);
    expect(dunningLadderFor('offline')).toBe(OFFLINE_ENROLMENT_DUNNING_DAY_OFFSETS);
    expect(dunningLadderFor('ypay')).toBe(ENROLMENT_DUNNING_DAY_OFFSETS);
    expect(dunningLadderFor(null)).toBe(ENROLMENT_DUNNING_DAY_OFFSETS);
  });

  it('card payers are cancelled on day 14, offline payers only on day 30', () => {
    const card = ENROLMENT_DUNNING_DAY_OFFSETS;
    const offline = OFFLINE_ENROLMENT_DUNNING_DAY_OFFSETS;
    expect(resolveEnrolmentDunningDueAttempt(CREATED, 2, day(14), card)).toBe(3);
    expect(resolveEnrolmentDunningDueAttempt(CREATED, 0, day(14), offline)).toBe(1);
    expect(resolveEnrolmentDunningDueAttempt(CREATED, 1, day(25), offline)).toBe(2);
    expect(resolveEnrolmentDunningDueAttempt(CREATED, 2, day(29), offline)).toBeNull();
    expect(resolveEnrolmentDunningDueAttempt(CREATED, 2, day(30), offline)).toBe(3);
    expect(resolveEnrolmentDunningDueAttempt(CREATED, 0, day(13), offline)).toBeNull();
  });

  it('schedules the offline steps on Jerusalem midnights of day 14 / 25 / 30', () => {
    const ladder = OFFLINE_ENROLMENT_DUNNING_DAY_OFFSETS;
    expect(enrolmentDunningActionDueAt(CREATED, 1, ladder)).toBe(jerusalemMidnightIso('2026-06-15'));
    expect(enrolmentDunningActionDueAt(CREATED, 2, ladder)).toBe(jerusalemMidnightIso('2026-06-26'));
    expect(enrolmentDunningActionDueAt(CREATED, 3, ladder)).toBe(jerusalemMidnightIso('2026-07-01'));
    // Card ladder unchanged by default.
    expect(enrolmentDunningActionDueAt(CREATED, 3)).toBe(jerusalemMidnightIso('2026-06-15'));
  });
});

/** Chain stub: tenants → the given provider; engagements → a fresh pending place. */
function service(paymentProvider: string) {
  const updates: Record<string, unknown>[] = [];
  const engagement = {
    id: 'eng-1', tenant_id: 't-1', person_id: 'p-1', offering_id: 'o-1', status: 'pending_payment',
    created_at: CREATED, payment_dunning_attempt_count: 0, payment_dunning_next_at: null,
  };
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain;
    chain.update = (u: Record<string, unknown>) => { updates.push(u); return chain; };
    chain.insert = () => chain;
    chain.single = async () => ({
      data: table === 'tenants' ? { payment_provider: paymentProvider, offline_payment_instructions: 'Bank 12' } : engagement,
      error: null,
    });
    chain.maybeSingle = async () => ({ data: { payment_dunning_next_at: updates.at(-1)?.payment_dunning_next_at }, error: null });
    return chain;
  };
  return { svc: { from } as never, updates };
}

describe('applyEnrolmentPaymentDunningStep on day 5', () => {
  it('offline place: first step scheduled for day 14, nothing sent yet', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(day(5));
    const { svc, updates } = service('offline');
    const result = await applyEnrolmentPaymentDunningStep(svc, 'eng-1', 'https://studio.test');
    expect(result).toEqual({ outcome: 'skipped', reason: 'not_due' });
    expect(updates[0]).toEqual({ payment_dunning_next_at: jerusalemMidnightIso('2026-06-15') });
  });

  it('card place: first step was due on day 3', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(day(5));
    const { svc, updates } = service('ypay');
    await applyEnrolmentPaymentDunningStep(svc, 'eng-1', 'https://studio.test').catch(() => undefined);
    expect(updates[0]).toEqual({ payment_dunning_next_at: jerusalemMidnightIso('2026-06-04') });
  });
});

describe('offline reminder email', () => {
  it.each(['en', 'he'] as const)('%s: says pay at the studio and names the 30-day release', (language) => {
    const copy = buildEnrolmentUnpaidEmailCopy({
      language, className: 'Ballet 1', studentName: 'Dana', attemptCount: 2, dueDate: 'x',
      offline: { cancelAfterDays: 30 },
    });
    expect(copy.intro).toContain(language === 'he' ? 'בסטודיו' : 'at the studio');
    expect(copy.intro).toContain('30');
  });

  it.each(['en', 'he'] as const)('%s: instructions replace the pay button and link', (language) => {
    const html = renderPaymentReminderHtml({
      language, schoolName: 'S', recipientName: 'P', amountFormatted: '₪350', className: 'Ballet 1',
      dueDate: 'x', paymentUrl: 'https://s/enrol/pay/e1?t=secret', description: 'd',
      primaryColor: '#123456', accentColor: '#654321',
      offline: { instructions: 'Bank 12-345\n<b>cash</b>' },
    });
    expect(html).not.toContain('enrol/pay');
    expect(html).not.toContain(language === 'he' ? 'בצע תשלום' : 'Make Payment');
    expect(html).toContain('Bank 12-345<br/>&lt;b&gt;cash&lt;/b&gt;');
  });

  it('card reminder keeps its pay button', () => {
    const html = renderPaymentReminderHtml({
      language: 'en', schoolName: 'S', recipientName: 'P', amountFormatted: '₪350', className: 'C',
      dueDate: 'x', paymentUrl: 'https://s/enrol/pay/e1', description: 'd', primaryColor: '#1', accentColor: '#2',
    });
    expect(html).toContain('Make Payment');
    expect(html).toContain('enrol/pay');
  });
});
