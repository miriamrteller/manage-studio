/**
 * G4b: finalisePayment must not enqueue a document when the bundled (Grow) invoice webhook has
 * already written external_document_id onto the payment row, but still enqueues otherwise.
 * Run: pnpm -C apps/web test bundled-skip-enqueue.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { enqueueDocument, advanceBillingSchedule } = vi.hoisted(() => ({
  enqueueDocument: vi.fn(),
  advanceBillingSchedule: vi.fn(),
}));

vi.mock('../../../../supabase/functions/_shared/enqueue-document.ts', () => ({
  enqueueDocument,
}));
vi.mock('../../../../supabase/functions/_shared/payments/advance-billing-schedule.ts', () => ({
  advanceBillingSchedule,
}));

import { finalisePayment } from '../../../../supabase/functions/_shared/payments/finalise-payment.ts';

/**
 * Minimal chainable Supabase stub. `audit_log` lookups always resolve truthy so the audit
 * inserts and the confirmation email short-circuit; `payments` resolves the external document id
 * the test wants to exercise.
 */
function makeService(externalDocumentId: string | null) {
  const handler = (table: string): Record<string, unknown> => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: () => chain,
      insert: async () => ({ data: null, error: null }),
      eq: () => chain,
      in: () => chain,
      lt: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === 'audit_log') return { data: { id: 'audit-1' }, error: null };
        if (table === 'payments') return { data: { external_document_id: externalDocumentId }, error: null };
        return { data: null, error: null };
      },
      single: async () => ({ data: null, error: null }),
    };
    return chain;
  };
  return { from: (table: string) => handler(table) } as never;
}

const baseParams = {
  tenantId: '00000000-0000-0000-0000-0000000000aa',
  paymentRow: { id: 'pay-1', engagement_id: 'eng-1', charge_type: 'renewal' },
  engagementId: 'eng-1',
  chargeType: 'renewal' as const,
  billingScheduleId: 'bs-1',
};

beforeEach(() => {
  enqueueDocument.mockClear();
  advanceBillingSchedule.mockClear();
});

describe('finalisePayment document enqueue', () => {
  it('skips enqueue when the payment already has an external document', async () => {
    await finalisePayment(makeService('DOC-555000'), baseParams);
    expect(enqueueDocument).not.toHaveBeenCalled();
  });

  it('enqueues a document when none has been issued yet', async () => {
    await finalisePayment(makeService(null), baseParams);
    expect(enqueueDocument).toHaveBeenCalledTimes(1);
  });

  it('still skips enqueue entirely when skipDocumentEnqueue is set', async () => {
    await finalisePayment(makeService(null), { ...baseParams, skipDocumentEnqueue: true });
    expect(enqueueDocument).not.toHaveBeenCalled();
  });
});
