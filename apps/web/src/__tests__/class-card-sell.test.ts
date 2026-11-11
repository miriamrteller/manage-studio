/**
 * Selling a class card at the studio: the payment is recorded the usual way, then the card is
 * given, linked to that payment. If giving the card fails, a retry reuses the payment.
 * Run: pnpm -C apps/web test class-card-sell.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => ({ invoke: [] as unknown[], rpc: [] as unknown[], rpcFails: false }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (fn: string, opts: { body: unknown }) => {
        calls.invoke.push([fn, opts.body]);
        return { data: { ok: true, paymentId: 'pay-1' }, error: null };
      }),
    },
    rpc: vi.fn(async (fn: string, args: unknown) => {
      calls.rpc.push([fn, args]);
      return calls.rpcFails
        ? { data: null, error: { message: 'class_card: switched_off' } }
        : { data: { id: 'card-1' }, error: null };
    }),
  },
}));

import { CardNotGivenError, sellClassCardAtStudio } from '@/features/class-cards/service';

const base = {
  cardTypeId: 'type-1',
  cardName: '10 classes',
  personId: 'person-1',
  amountMinor: 50000,
  method: 'cash' as const,
  sendConfirmation: true,
  note: 'Class card: 10 classes',
};

beforeEach(() => {
  calls.invoke = [];
  calls.rpc = [];
  calls.rpcFails = false;
});

describe('sellClassCardAtStudio', () => {
  it('records the payment, then gives the card linked to it', async () => {
    const r = await sellClassCardAtStudio(base);
    expect(r).toEqual({ cardId: 'card-1', paymentId: 'pay-1' });
    expect(calls.invoke).toEqual([
      ['record-payment', { person_id: 'person-1', amount_minor: 50000, method: 'cash', note: 'Class card: 10 classes' }],
    ]);
    expect(calls.rpc).toEqual([
      ['issue_class_card', { p_card_type_id: 'type-1', p_person_id: 'person-1', p_payment_id: 'pay-1' }],
    ]);
  });

  it('a free card records no payment', async () => {
    await sellClassCardAtStudio({ ...base, amountMinor: 0 });
    expect(calls.invoke).toHaveLength(0);
    expect(calls.rpc[0]).toEqual(['issue_class_card', { p_card_type_id: 'type-1', p_person_id: 'person-1', p_payment_id: null }]);
  });

  it('if the card is not given, the retry reuses the recorded payment', async () => {
    calls.rpcFails = true;
    const err = await sellClassCardAtStudio(base).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CardNotGivenError);
    expect((err as CardNotGivenError).paymentId).toBe('pay-1');

    calls.rpcFails = false;
    await sellClassCardAtStudio({ ...base, paymentId: 'pay-1' });
    expect(calls.invoke).toHaveLength(1);
  });

  it('an untick of the confirmation is sent; the default is not', async () => {
    await sellClassCardAtStudio({ ...base, sendConfirmation: false });
    expect((calls.invoke[0] as [string, Record<string, unknown>])[1].send_confirmation).toBe(false);
  });
});

import { nextSessionDate } from '@/features/class-cards/service';

describe('nextSessionDate', () => {
  // Tuesday 10 Nov 2026, 10:00 in Israel.
  const tue = new Date('2026-11-10T08:00:00Z');
  it('is today when the class runs today', () => expect(nextSessionDate(2, tue)).toBe('2026-11-10'));
  it('is the next class day otherwise', () => {
    expect(nextSessionDate(4, tue)).toBe('2026-11-12');
    expect(nextSessionDate(0, tue)).toBe('2026-11-15');
  });
  it('uses Israel time, not UTC, near midnight', () =>
    expect(nextSessionDate(3, new Date('2026-11-10T22:30:00Z'))).toBe('2026-11-11'));
  it('is today for a class without a weekday', () => expect(nextSessionDate(null, tue)).toBe('2026-11-10'));
});

import { classCardErrorCode, isLateCancel } from '@/features/class-cards/service';

describe('portal helpers', () => {
  it('a cancel is late inside the cutoff', () => {
    const now = new Date('2026-11-10T08:00:00Z');
    expect(isLateCancel('2026-11-10T21:00:00Z', 12, now)).toBe(false);
    expect(isLateCancel('2026-11-10T19:00:00Z', 12, now)).toBe(true);
    expect(isLateCancel('2026-11-10T08:30:00Z', 0, now)).toBe(false);
  });
  it('reads the short code from a database error', () => {
    expect(classCardErrorCode({ message: 'class_card: class_full' })).toBe('class_full');
    expect(classCardErrorCode(new Error('class_card: no_classes_left'))).toBe('no_classes_left');
    expect(classCardErrorCode({ message: 'network' })).toBeNull();
  });
});
