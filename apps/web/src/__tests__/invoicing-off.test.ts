/**
 * Invoicing off (tenants.invoicing_provider = 'none'): the slug parses, never yields an
 * adapter, and neither enqueueDocument nor finalisePayment queues a tax document.
 * Run: pnpm -C apps/web test invoicing-off.test.ts
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../supabase/functions/_shared/payments/advance-billing-schedule.ts', () => ({
  advanceBillingSchedule: vi.fn(),
}));
import {
  INVOICING_PROVIDER_SLUGS,
  isInvoicingOff,
  parseInvoicingProviderSlug,
} from '../../../../supabase/functions/_shared/invoicing/registry.ts';
import { getInvoicingProvider } from '../../../../supabase/functions/_shared/invoicing/index.ts';
import {
  DOCUMENT_ENQUEUE_SKIPPED,
  enqueueDocument,
} from '../../../../supabase/functions/_shared/enqueue-document.ts';
import { finalisePayment } from '../../../../supabase/functions/_shared/payments/finalise-payment.ts';
import { resolveInvoicingProviderToSave } from '../features/settings/components/InvoicingToggleForm';

describe('invoicing provider "none"', () => {
  it('is a valid slug, recognised as off, and the default is still grow', () => {
    expect(INVOICING_PROVIDER_SLUGS).toContain('none');
    expect(parseInvoicingProviderSlug('none')).toBe('none');
    expect(isInvoicingOff('none')).toBe(true);
    expect(isInvoicingOff('grow')).toBe(false);
    expect(isInvoicingOff(null)).toBe(false);
    expect(parseInvoicingProviderSlug(null)).toBe('grow');
  });

  it('never yields an invoicing adapter', () => {
    expect(() => getInvoicingProvider('none')).toThrow(/Invoicing is off/);
  });
});

/** Chainable stub: tenants resolve the given invoicing_provider; every insert is recorded. */
function makeService(invoicingProvider: string, opts: { externalDocumentId?: string | null } = {}) {
  const inserts: Array<{ table: string; payload: unknown }> = [];
  const handler = (table: string): Record<string, unknown> => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: () => chain,
      insert: (payload: unknown) => {
        inserts.push({ table, payload });
        return chain;
      },
      eq: () => chain,
      in: () => chain,
      lt: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === 'tenants') return { data: { invoicing_provider: invoicingProvider }, error: null };
        if (table === 'audit_log') return { data: { id: 'audit-1' }, error: null };
        if (table === 'payments') return { data: { external_document_id: opts.externalDocumentId ?? null }, error: null };
        return { data: null, error: null };
      },
      single: async () => {
        if (table === 'document_queue') return { data: { id: 'q-1' }, error: null };
        return { data: null, error: null };
      },
    };
    return chain;
  };
  return { service: { from: (table: string) => handler(table) } as never, inserts };
}

describe('enqueueDocument with invoicing off', () => {
  it('skips the queue and audits why', async () => {
    const { service, inserts } = makeService('none');
    const result = await enqueueDocument(service, { tenantId: 't1', paymentId: 'p1', documentKind: 'sale' });
    expect(result).toEqual({ queued: false, skipped: 'invoicing_off' });
    expect(inserts.map((i) => i.table)).toEqual(['audit_log']);
    expect(inserts[0].payload).toMatchObject({ action: DOCUMENT_ENQUEUE_SKIPPED, entity_id: 'p1' });
  });

  it('still queues for a tenant with a provider', async () => {
    const { service, inserts } = makeService('grow');
    const result = await enqueueDocument(service, { tenantId: 't1', paymentId: 'p1', documentKind: 'sale' });
    expect(result).toMatchObject({ queued: true, queueId: 'q-1' });
    expect(inserts.map((i) => i.table)).toEqual(['document_queue']);
  });
});

describe('finalisePayment with invoicing off', () => {
  const params = {
    tenantId: 't1',
    paymentRow: { id: 'pay-1', engagement_id: 'eng-1', charge_type: 'renewal' },
    engagementId: 'eng-1',
    chargeType: 'renewal' as const,
    billingScheduleId: 'bs-1',
  };

  it('does not touch document_queue for a payment of an invoicing-off tenant', async () => {
    const { service, inserts } = makeService('none');
    await finalisePayment(service, params);
    expect(inserts.filter((i) => i.table === 'document_queue')).toHaveLength(0);
  });

  it('queues a document for a tenant with a provider', async () => {
    const { service, inserts } = makeService('grow');
    await finalisePayment(service, params);
    expect(inserts.filter((i) => i.table === 'document_queue')).toHaveLength(1);
  });
});

describe('InvoicingToggleForm save value', () => {
  it('stores none when off and the chosen provider when on', () => {
    expect(resolveInvoicingProviderToSave({ enabled: false, selectedProvider: 'grow' })).toBe('none');
    expect(resolveInvoicingProviderToSave({ enabled: true, selectedProvider: 'icount' })).toBe('icount');
  });
});
