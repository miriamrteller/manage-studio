/**
 * Pay-at-the-studio / invoicing-off tenants (e.g. a studio that is not a registered
 * business yet): no tax document is ever queued, and unpaid places are not chased
 * with pay links (they get the longer offline dunning ladder instead).
 * Run: pnpm -C apps/web test offline-studio-no-documents.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { enqueueDocument } from '../../../../supabase/functions/_shared/enqueue-document.ts';

function tenantService(tenantRow: Record<string, unknown>) {
  const insert = vi.fn(async () => ({ data: { id: 'q-1' }, error: null }));
  const service = {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        insert: (...args: unknown[]) => {
          insert(...(args as []));
          return chain;
        },
        maybeSingle: async () => ({ data: table === 'tenants' ? tenantRow : null, error: null }),
        single: async () => {
          if (table === 'tenants') return { data: tenantRow, error: null };
          if (table === 'engagements') {
            return {
              data: {
                id: 'eng-1',
                tenant_id: 't-1',
                status: 'pending_payment',
                created_at: '2026-01-01T00:00:00Z',
                payment_dunning_attempt_count: 0,
                payment_dunning_next_at: null,
              },
              error: null,
            };
          }
          return { data: { id: 'q-1' }, error: null };
        },
      };
      return chain;
    },
  };
  return { service: service as never, insert };
}

describe('invoicing_provider = none', () => {
  it('queues no tax document', async () => {
    const { service, insert } = tenantService({ invoicing_provider: 'none' });
    const result = await enqueueDocument(service, {
      tenantId: 't-1',
      paymentId: 'pay-1',
      documentKind: 'sale',
    });
    expect(result).toEqual({ queued: false });
    expect(insert).not.toHaveBeenCalled();
  });

  it('still queues for a tenant with a provider', async () => {
    const { service, insert } = tenantService({ invoicing_provider: 'ypay' });
    const result = await enqueueDocument(service, {
      tenantId: 't-1',
      paymentId: 'pay-1',
      documentKind: 'sale',
    });
    expect(result.queued).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

// Dunning for payment_provider = 'offline' (14 / 25 / 30 ladder): offline-dunning-ladder.test.ts.
