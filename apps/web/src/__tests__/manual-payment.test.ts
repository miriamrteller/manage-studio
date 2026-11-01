/**
 * Offline payment request (parent) + manual payment record (admin) contracts.
 * Deterministic money code: no provider, no AI; the human actor is on the row.
 * Run: pnpm -C apps/web test manual-payment.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildManualPaymentCompletion,
  buildManualPaymentRow,
  buildOfflineRequestRow,
  offlineRequestPaymentRef,
  recordManualPayment,
  type ManualPaymentTarget,
} from '../../../../supabase/functions/_shared/payments/manual-payment.ts';

const target: ManualPaymentTarget = {
  tenantId: 'tenant-1',
  engagementId: '00000000-0000-0000-0000-000000001001',
  personId: 'person-1',
  accountId: null,
  offeringId: 'offering-1',
  billingAccountId: 'ba-1',
  totalMinor: 35000,
  currency: 'ils',
};

describe('offline payment request row', () => {
  it('is a pending manual payment with the chosen method and gross total only', () => {
    const row = buildOfflineRequestRow(target, 'bank_transfer');
    expect(row.provider).toBe('manual');
    expect(row.status).toBe('pending');
    expect(row.payment_method).toBe('bank_transfer');
    expect(row.charge_type).toBe('initial');
    expect(row.total_amount_minor).toBe(35000);
    expect(row.pretax_amount_minor).toBe(0);
    expect(row.vat_amount_minor).toBe(0);
    expect(row.currency).toBe('ILS');
    expect(row.person_id).toBe('person-1');
    expect(row.provider_payment_ref).toBe(offlineRequestPaymentRef(target.engagementId));
  });

  it('uses one ref per engagement so a repeat click cannot create a second request', () => {
    expect(offlineRequestPaymentRef('e1')).toBe(offlineRequestPaymentRef('e1'));
    expect(offlineRequestPaymentRef('e1')).not.toBe(offlineRequestPaymentRef('e2'));
  });
});

describe('manual payment record', () => {
  it('stores the admin as created_by and approved_by on the paid row', () => {
    const row = buildManualPaymentRow(target, {
      method: 'cash',
      actorUserId: 'admin-1',
      paidAt: '2026-11-01T10:00:00.000Z',
    });
    expect(row.status).toBe('succeeded');
    expect(row.created_by).toBe('admin-1');
    expect(row.approved_by).toBe('admin-1');
    expect(row.paid_at).toBe('2026-11-01T10:00:00.000Z');
    expect(row.description).toBe('Manual cash payment');
  });

  it('completion of a pending request flips status and records the actor', () => {
    const patch = buildManualPaymentCompletion({
      method: 'bank_transfer',
      note: 'paid in office',
      actorUserId: 'admin-2',
      paidAt: '2026-11-02T10:00:00.000Z',
      totalMinor: 35000,
    });
    expect(patch).toEqual({
      status: 'succeeded',
      payment_method: 'bank_transfer',
      total_amount_minor: 35000,
      paid_at: '2026-11-02T10:00:00.000Z',
      description: 'paid in office',
      created_by: 'admin-2',
      approved_by: 'admin-2',
    });
  });
});

/** Minimal chainable stand-in for the supabase-js query builder. */
function fakeService(opts: { pending: { id: string; payment_method: string | null } | null }) {
  const calls: Array<{ op: string; payload?: unknown }> = [];
  const chain = (result: unknown) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    for (const m of ['select', 'eq', 'order', 'limit']) q[m] = vi.fn(self);
    q.maybeSingle = vi.fn(async () => ({ data: result, error: null }));
    q.single = vi.fn(async () => ({ data: result, error: null }));
    return q;
  };
  const service = {
    from: vi.fn((table: string) => {
      expect(table).toBe('payments');
      return {
        select: vi.fn(() => chain(opts.pending)),
        update: vi.fn((payload: unknown) => {
          calls.push({ op: 'update', payload });
          return chain({ id: opts.pending?.id, engagement_id: target.engagementId, charge_type: 'initial' });
        }),
        insert: vi.fn((payload: unknown) => {
          calls.push({ op: 'insert', payload });
          return chain({ id: 'pay-new', engagement_id: target.engagementId, charge_type: 'initial' });
        }),
      };
    }),
  };
  return { service: service as never, calls };
}

describe('recordManualPayment', () => {
  it('completes the parent\'s pending offline request instead of inserting a second row', async () => {
    const { service, calls } = fakeService({ pending: { id: 'pay-req', payment_method: 'cash' } });
    const result = await recordManualPayment(service, target, { method: 'cash', actorUserId: 'admin-1' });
    expect(result).toMatchObject({ ok: true, completedRequest: true, row: { id: 'pay-req' } });
    expect(calls.map((c) => c.op)).toEqual(['update']);
    expect(calls[0].payload).toMatchObject({ status: 'succeeded', approved_by: 'admin-1' });
  });

  it('inserts a paid row when there is no pending request', async () => {
    const { service, calls } = fakeService({ pending: null });
    const result = await recordManualPayment(service, target, { method: 'bank_transfer', actorUserId: 'admin-1' });
    expect(result).toMatchObject({ ok: true, completedRequest: false, row: { id: 'pay-new' } });
    expect(calls.map((c) => c.op)).toEqual(['insert']);
    expect(calls[0].payload).toMatchObject({ provider: 'manual', status: 'succeeded', payment_method: 'bank_transfer' });
  });
});
