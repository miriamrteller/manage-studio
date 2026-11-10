// @vitest-environment jsdom
/**
 * Settings -> Tax documents: "Which document does Green Invoice issue?" An explicit choice
 * (400 receipt / 320 tax invoice-receipt), prefilled from business status when a studio picks
 * Green Invoice, and never switched by business status afterwards.
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  update: vi.fn(),
  tenant: {} as Record<string, unknown>,
  row: { green_invoice_document_type: 320, legal_profile: {} } as Record<string, unknown>,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: h.row, error: null }) }) }),
      update: (p: unknown) => {
        h.update(p);
        return { eq: async () => ({ error: null }) };
      },
    }),
  },
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 'tenant-1', ...h.tenant }) }));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import {
  InvoicingToggleForm,
  initialGreenInvoiceDocumentType,
  suggestedGreenInvoiceDocumentType,
} from '@/features/settings/components/InvoicingToggleForm';

afterEach(() => {
  cleanup();
  h.update.mockReset();
  for (const k of Object.keys(h.tenant)) delete h.tenant[k];
  h.row = { green_invoice_document_type: 320, legal_profile: {} };
});

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const LABEL = 'settings.invoicing_toggle.gi_document_label';

describe('Green Invoice document type: the rules', () => {
  it('suggests a receipt for exempt dealers and studios not yet registered', () => {
    expect(suggestedGreenInvoiceDocumentType('osek_patur')).toBe(400);
    expect(suggestedGreenInvoiceDocumentType('not_registered')).toBe(400);
    expect(suggestedGreenInvoiceDocumentType('osek_murshe')).toBe(320);
    expect(suggestedGreenInvoiceDocumentType('company')).toBe(320);
    expect(suggestedGreenInvoiceDocumentType(null)).toBe(320);
  });

  it('a studio already on Green Invoice keeps its saved choice, whatever its business status', () => {
    expect(initialGreenInvoiceDocumentType({ currentProvider: 'green_invoice', saved: 320, businessStatus: 'osek_patur' })).toBe(320);
    expect(initialGreenInvoiceDocumentType({ currentProvider: 'green_invoice', saved: 400, businessStatus: 'company' })).toBe(400);
    expect(initialGreenInvoiceDocumentType({ currentProvider: 'ypay', saved: 320, businessStatus: 'osek_patur' })).toBe(400);
  });
});

describe('Settings -> Tax documents', () => {
  it('Green Invoice is not offered to a studio switching (owner decision 2026-11-10)', () => {
    Object.assign(h.tenant, { payment_provider: 'offline', invoicing_provider: 'none' });
    h.row = { green_invoice_document_type: 320, legal_profile: { business_status: 'osek_patur' } };
    wrap(<InvoicingToggleForm />);

    fireEvent.click(screen.getByLabelText('settings.invoicing_toggle.enabled_label'));
    const options = Array.from((screen.getByLabelText('settings.invoicing.provider') as HTMLSelectElement).options).map(
      (o) => o.value,
    );
    expect(options).toEqual(['ypay']);
    expect(screen.queryByLabelText(LABEL)).toBeNull();
  });

  it('shows the saved choice; a business status that suggests otherwise is only a note, never a block', async () => {
    Object.assign(h.tenant, { payment_provider: 'offline', invoicing_provider: 'green_invoice' });
    h.row = { green_invoice_document_type: 320, legal_profile: { business_status: 'osek_patur' } };
    wrap(<InvoicingToggleForm />);

    await waitFor(() => expect(screen.getByText('settings.invoicing_toggle.gi_document_differs_400')).toBeTruthy());
    expect(screen.getByLabelText(LABEL)).toHaveValue('320');
    expect(screen.getByRole('button', { name: 'common.save' })).toBeEnabled();

    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: '400' } });
    expect(screen.queryByText('settings.invoicing_toggle.gi_document_differs_400')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() =>
      expect(h.update).toHaveBeenCalledWith({ invoicing_provider: 'green_invoice', green_invoice_document_type: 400 }),
    );
  });

  it('other providers are saved without a Green Invoice choice', async () => {
    Object.assign(h.tenant, { payment_provider: 'ypay', invoicing_provider: 'ypay' });
    wrap(<InvoicingToggleForm />);
    expect(screen.queryByLabelText(LABEL)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ invoicing_provider: 'ypay' }));
  });
});
