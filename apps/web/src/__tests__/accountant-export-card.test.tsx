// @vitest-environment jsdom
/**
 * The accountant export card: period prefilled with the last VAT period (every 2 months
 * by default), dates editable, download never blocked.
 * Run: pnpm -C apps/web test accountant-export-card.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { accountantPeriodRange } from '@/features/finance-admin/lib/periods';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', getFixedT: () => (key: string) => key } }),
}));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't1', subdomain: 'studio', invoicing_provider: 'ypay' }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { vat_report_period: 'bi_monthly' } }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
}));

import { AccountantExportCard } from '@/features/finance-admin/components/AccountantExportCard';

function renderCard(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => cleanup());

describe('AccountantExportCard', () => {
  it('prefills the last VAT period and lets the dates be edited', () => {
    renderCard(<AccountantExportCard />);
    const expected = accountantPeriodRange('vat_previous', 'bi_monthly');
    const from = screen.getByLabelText('finance.accountant_export.from') as HTMLInputElement;
    const to = screen.getByLabelText('finance.accountant_export.to') as HTMLInputElement;
    expect(from.value).toBe(expected.startDate);
    expect(to.value).toBe(expected.endDate);

    fireEvent.change(from, { target: { value: '2026-01-01' } });
    expect(from.value).toBe('2026-01-01');
    expect((screen.getByLabelText('finance.accountant_export.period') as HTMLSelectElement).value).toBe('custom');
    expect(screen.getByRole('button', { name: 'finance.accountant_export.download' })).toBeEnabled();
  });
});
