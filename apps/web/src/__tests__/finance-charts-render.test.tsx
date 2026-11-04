// @vitest-environment jsdom
/**
 * Finance hub, PR4: the VAT-period summary and the charts render from paid payments, each
 * chart with a table view.
 * Run: pnpm -C apps/web test finance-charts-render.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, afterEach, vi, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't1', subdomain: 'studio', invoicing_provider: 'ypay', currency: 'ILS' }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ in: async () => ({ data: [{ amount_minor: 50000 }], error: null }) }) }),
    }),
  },
}));
const paid = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    pretax_amount_minor: 0,
    vat_amount_minor: 0,
    total_amount_minor: 11800,
    currency: 'ILS',
    status: 'succeeded',
    charge_type: 'initial',
    provider: 'ypay',
    payment_method: 'card',
    paid_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    external_document_id: 'd',
    external_document_number: '1',
    issued_document_kind: 'tax_invoice_receipt',
    document_queue: [],
  },
];
vi.mock('@/features/finance-admin/hooks/useAccountantData', () => ({
  useVatReportPeriod: () => ({ vatPeriod: 'bi_monthly', setVatPeriod: vi.fn() }),
  usePaidPayments: () => ({ data: paid, isLoading: false, error: null }),
}));

import { VatPeriodSummaryCard } from '@/features/finance-admin/components/VatPeriodSummaryCard';
import { FinanceCharts } from '@/features/finance-admin/components/FinanceCharts';

beforeAll(() => {
  // recharts' ResponsiveContainer needs ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => cleanup());

describe('VatPeriodSummaryCard', () => {
  it('shows VAT from the documents, prefilled with the last VAT period', () => {
    wrap(<VatPeriodSummaryCard />);
    expect(screen.getByText('finance.vat_summary.title')).toBeInTheDocument();
    expect((screen.getByLabelText('finance.accountant_export.period') as HTMLSelectElement).value).toBe('vat_previous');
    expect(screen.getByText('finance.vat_summary.vat')).toBeInTheDocument();
    expect(screen.getByText(/₪18(?!\d)/)).toBeInTheDocument();
  });
});

describe('FinanceCharts', () => {
  it('renders both charts with table views and the waiting total', async () => {
    wrap(<FinanceCharts />);
    expect(screen.getByText('finance.charts.by_month')).toBeInTheDocument();
    expect(screen.getByText('finance.charts.by_method')).toBeInTheDocument();
    expect(screen.getAllByText('finance.charts.show_table')).toHaveLength(2);
    expect(await screen.findByText(/₪500(?!\d)/)).toBeInTheDocument();
  });
});
