// @vitest-environment jsdom
/**
 * Accountant view, PR3: the payments log shows each payment's document (type + number +
 * link) or why there is none, and the detail drawer shows the VAT split and the refunded
 * document.
 * Run: pnpm -C apps/web test payment-document-cell.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PaymentLogRow } from '@shared/schemas';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string | string[], opts?: Record<string, unknown>) => {
      const k = Array.isArray(key) ? key[0] : key;
      return opts && Object.keys(opts).some((o) => o !== 'defaultValue')
        ? `${k}:${JSON.stringify(Object.fromEntries(Object.entries(opts).filter(([o]) => o !== 'defaultValue')))}`
        : k;
    },
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't1', subdomain: 'studio', invoicing_provider: 'ypay' }),
}));
const documentNumbersByPaymentIds = vi.fn(async () => new Map([['orig-1', '1001']]));
vi.mock('@/features/finance-admin/services/paymentsLogService', () => ({
  PaymentsLogService: { documentNumbersByPaymentIds: (...a: unknown[]) => documentNumbersByPaymentIds(...(a as [])) },
  getProviderLabelKey: (p: string) => `finance.provider.${p}`,
}));

import { PaymentDocumentCell } from '@/features/finance-admin/components/PaymentDocumentCell';
import { PaymentDetailDrawer } from '@/features/finance-admin/components/PaymentDetailDrawer';

function base(over: Partial<PaymentLogRow> = {}): PaymentLogRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    pretax_amount_minor: 0,
    vat_amount_minor: 0,
    total_amount_minor: 11800,
    currency: 'ILS',
    status: 'succeeded',
    charge_type: 'initial',
    provider: 'ypay',
    payment_method: 'card',
    paid_at: '2026-09-10T08:00:00Z',
    created_at: '2026-09-10T08:00:00Z',
    external_document_id: 'd1',
    external_document_number: '1001',
    invoice_url: 'https://docs/1001.pdf',
    issued_document_kind: 'tax_invoice_receipt',
    document_queue: [],
    ...over,
  } as PaymentLogRow;
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => cleanup());

describe('PaymentDocumentCell', () => {
  it('shows the type and a link to the numbered document', () => {
    wrap(<PaymentDocumentCell row={base()} />);
    expect(screen.getByText('finance.accountant_export.document_kind.tax_invoice_receipt')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '1001' })).toHaveAttribute('href', 'https://docs/1001.pdf');
  });

  it('shows why there is no document', () => {
    wrap(
      <PaymentDocumentCell
        row={base({
          external_document_id: null,
          external_document_number: null,
          invoice_url: null,
          issued_document_kind: null,
          document_queue: [{ status: 'dead', document_kind: 'sale', created_at: '2026-09-10T08:00:00Z' }],
        })}
      />,
    );
    expect(screen.getByText('finance.accountant_export.no_document.failed')).toBeInTheDocument();
  });

  it('unknown type: "document issued by <provider>"', () => {
    wrap(<PaymentDocumentCell row={base({ provider: 'grow', issued_document_kind: null, invoice_url: null })} />);
    expect(screen.getByText(/finance\.accountant_export\.document_kind\.unknown/)).toBeInTheDocument();
    expect(screen.getByText('1001')).toBeInTheDocument();
  });
});

describe('PaymentDetailDrawer', () => {
  it('shows the VAT split from the document', () => {
    wrap(<PaymentDetailDrawer row={base()} onClose={() => {}} />);
    expect(screen.getByText('finance.payments.col_vat_split')).toBeInTheDocument();
    expect(screen.getByText(/"rate":18/)).toBeInTheDocument();
  });

  it('a refund shows the document it refunds', async () => {
    wrap(
      <PaymentDetailDrawer
        row={base({
          charge_type: 'refund',
          total_amount_minor: -11800,
          external_document_id: null,
          external_document_number: null,
          invoice_url: null,
          issued_document_kind: null,
          refunds_payment_id: 'orig-1',
        })}
        onClose={() => {}}
      />,
    );
    expect(await screen.findByText('1001')).toBeInTheDocument();
    expect(screen.getByText('finance.accountant_export.no_document.refund_in_provider')).toBeInTheDocument();
    expect(screen.queryByText('finance.payments.col_vat_split')).not.toBeInTheDocument();
  });
});

describe('PaymentsLogTable', () => {
  it('shows each payment\'s document in the Document column', async () => {
    const { PaymentsLogTable } = await import('@/features/finance-admin/components/PaymentsLogTable');
    wrap(
      <PaymentsLogTable
        rows={[
          base(),
          base({
            id: '00000000-0000-0000-0000-000000000002',
            external_document_id: null,
            external_document_number: null,
            invoice_url: null,
            issued_document_kind: null,
            status: 'pending',
          }),
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: '1001' })).toBeInTheDocument();
    expect(screen.getByText('finance.accountant_export.no_document.not_paid')).toBeInTheDocument();
  });
});
