// @vitest-environment jsdom
/**
 * Cash documents in a Grow / iCount / Invoice4U studio (payments audit P2 #12): those services
 * only issue a document with their own card charge, so a cash payment or a refund is recorded
 * as 'not_issued' (no retries, no alert) and listed on the finance page; their own card
 * payments get no queue row (the document comes on the provider's notice).
 * Run: pnpm -C apps/web test documents-not-issued.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  documentRouteFor,
  enqueueDocument,
} from '../../../../supabase/functions/_shared/enqueue-document.ts';
import { makeGrowFakeService } from './helpers/growFakeService';

const { from, tenantState } = vi.hoisted(() => ({ from: vi.fn(), tenantState: {} as Record<string, unknown> }));
vi.mock('@/lib/supabase', () => ({ supabase: { from } }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 'tenant-1', currency: 'ILS', ...tenantState }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o?.provider ? `${k}[${String(o.provider)}]` : k),
    i18n: { language: 'en' },
  }),
}));

import { DocumentsNotIssuedCard } from '../features/finance-admin/components/DocumentsNotIssuedCard';

afterEach(() => {
  cleanup();
  from.mockReset();
  for (const k of Object.keys(tenantState)) delete tenantState[k];
});

describe('documentRouteFor', () => {
  it('queues documents for services that can issue standalone ones', () => {
    for (const invoicing of ['green_invoice', 'ypay', 'mock']) {
      expect(documentRouteFor({ invoicingProvider: invoicing, paymentProvider: 'manual', documentKind: 'sale' })).toEqual({ route: 'queue' });
    }
  });

  it('skips when the studio issues no documents', () => {
    expect(documentRouteFor({ invoicingProvider: 'none', paymentProvider: 'manual', documentKind: 'sale' })).toEqual({ route: 'skip_no_documents' });
  });

  it("waits for the provider's notice on its own card payments", () => {
    for (const p of ['grow', 'icount', 'invoice4u']) {
      expect(documentRouteFor({ invoicingProvider: p, paymentProvider: p, documentKind: 'sale' })).toEqual({ route: 'skip_issued_with_charge' });
    }
  });

  it('records cash payments and refunds as not issued', () => {
    for (const p of ['grow', 'icount', 'invoice4u']) {
      expect(documentRouteFor({ invoicingProvider: p, paymentProvider: 'manual', documentKind: 'sale' }).route).toBe('not_issued');
      expect(documentRouteFor({ invoicingProvider: p, paymentProvider: p, documentKind: 'refund' }).route).toBe('not_issued');
    }
  });
});

describe('enqueueDocument', () => {
  function fake(invoicing: string, provider: string) {
    return makeGrowFakeService({
      tables: {
        tenants: [{ id: 't1', invoicing_provider: invoicing }],
        payments: [{ id: 'pay-1', tenant_id: 't1', provider }],
        document_queue: [],
      },
    });
  }

  it('records a cash payment in a Grow studio as not issued, once, with no pending row', async () => {
    const { service, tables } = fake('grow', 'manual');
    await expect(enqueueDocument(service, { tenantId: 't1', paymentId: 'pay-1', documentKind: 'sale' }))
      .resolves.toEqual({ queued: false, notIssued: true });
    // A replayed finalise does not add a second row.
    await enqueueDocument(service, { tenantId: 't1', paymentId: 'pay-1', documentKind: 'sale' });
    expect(tables.document_queue).toHaveLength(1);
    expect(tables.document_queue[0]).toMatchObject({ status: 'not_issued', document_kind: 'sale' });
    expect(String(tables.document_queue[0].last_error)).toMatch(/Green Invoice or YPay/);
  });

  it('adds no queue row for a Grow card payment (the document comes with the charge)', async () => {
    const { service, tables } = fake('grow', 'grow');
    await expect(enqueueDocument(service, { tenantId: 't1', paymentId: 'pay-1', documentKind: 'sale' }))
      .resolves.toEqual({ queued: false });
    expect(tables.document_queue).toHaveLength(0);
  });

  it('still queues a cash payment when Green Invoice issues the documents', async () => {
    const { service, tables } = fake('green_invoice', 'manual');
    const result = await enqueueDocument(service, { tenantId: 't1', paymentId: 'pay-1', documentKind: 'sale' });
    expect(result.queued).toBe(true);
    expect(tables.document_queue[0]).toMatchObject({ status: 'pending' });
  });
});

describe('Finance page: payments without a tax document', () => {
  function mockRows(rows: unknown[]) {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order']) q[m] = () => q;
    q.limit = async () => ({ data: rows, error: null });
    from.mockImplementation(() => q);
  }
  const wrap = () =>
    render(<QueryClientProvider client={new QueryClient()}><DocumentsNotIssuedCard /></QueryClientProvider>);

  it('lists not-issued and failed documents with the reason', async () => {
    Object.assign(tenantState, { invoicing_provider: 'grow' });
    mockRows([
      { id: 'q1', status: 'not_issued', document_kind: 'sale', last_error: 'x', created_at: '2026-11-01T10:00:00Z',
        payments: { total_amount_minor: 15000, currency: 'ILS', paid_at: '2026-11-01T10:00:00Z', payment_method: 'cash' } },
      { id: 'q2', status: 'dead', document_kind: 'sale', last_error: 'HTTP 500 from provider', created_at: '2026-11-01T11:00:00Z',
        payments: { total_amount_minor: 2000, currency: 'ILS', paid_at: null, payment_method: 'card' } },
    ]);
    wrap();
    expect(await screen.findByRole('heading', { name: 'finance.documents_not_issued.title' })).toBeTruthy();
    expect(screen.getByText('finance.documents_not_issued.reason_not_issued[settings.provider_names.grow]')).toBeTruthy();
    expect(screen.getByText('finance.documents_not_issued.reason_failed')).toBeTruthy();
    expect(screen.getByText('HTTP 500 from provider')).toBeTruthy();
    expect(from).toHaveBeenCalledWith('document_queue');
  });

  it('shows nothing when every payment has its document', async () => {
    mockRows([]);
    const { container } = wrap();
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe('');
  });
});
