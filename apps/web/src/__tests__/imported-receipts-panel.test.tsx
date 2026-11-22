// @vitest-environment jsdom
/**
 * Finance -> Import -> "Send receipt": one press sends the row with everything prefilled; rows
 * with an old receipt are never offered one; receipts off shows where to switch them on.
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  send: vi.fn(),
  tenant: { invoicing_provider: 'ypay' } as Record<string, unknown>,
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 'tenant-1', currency: 'ILS', ...h.tenant }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/features/finance-admin/import/importedReceipts', async (orig) => {
  const actual = await orig<typeof import('@/features/finance-admin/import/importedReceipts')>();
  return {
    ...actual,
    ImportedReceiptsService: {
      list: async () => [
        { id: 'r1', income_date: '2026-03-04', amount_minor: 120000, payer_name: 'Eli Kirzner', payer_email: null, payment_method: 'BIT', job_name: 'Kirzner F', receipt_book: null, receipt_number: null, payment_id: null, payment: null },
        { id: 'r2', income_date: '2026-03-05', amount_minor: 5000, payer_name: 'Old Receipt', payer_email: null, payment_method: 'cash', job_name: null, receipt_book: null, receipt_number: '17', payment_id: null, payment: null },
      ],
      clients: async () => [{ id: 'c1', name: 'Kirzner F', email: 'k@example.test' }],
      send: (rows: unknown) => {
        h.send(rows);
        return Promise.resolve([{ income_id: 'r1', ok: true, payment_id: 'p1' }]);
      },
    },
  };
});

import { ImportedReceipts } from '@/features/finance-admin/import/ImportedReceipts';

function wrap(ui: ReactNode) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  h.send.mockReset();
  h.tenant = { invoicing_provider: 'ypay' };
});

describe('ImportedReceipts', () => {
  it('sends a row in one press with the email of the matching client and the sheet method', async () => {
    render(wrap(<ImportedReceipts />));
    await waitFor(() => expect(screen.getByDisplayValue('k@example.test')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'finance.import.receipts.send' }));
    await waitFor(() => expect(h.send).toHaveBeenCalledWith([{ income_id: 'r1', email: 'k@example.test', method: 'bit' }]));
    // Only the open row has a Send button; the old-receipt row is listed apart.
    expect(screen.getAllByRole('button', { name: 'finance.import.receipts.send' })).toHaveLength(1);
    expect(screen.getByText('finance.import.receipts.old_title')).toBeTruthy();
  });

  it('with receipts off, shows where to switch them on and offers no button', async () => {
    h.tenant = { invoicing_provider: 'none' };
    render(wrap(<ImportedReceipts />));
    await waitFor(() => expect(screen.getByText('finance.import.receipts.off_link')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'finance.import.receipts.send' })).toBeNull();
  });
});
