// @vitest-environment jsdom
/**
 * Prefill on the forms themselves: an expense correction starts from the expense
 * it corrects; turning a lead into a shoot starts from the lead's date and the
 * package's location. Everything stays editable.
 * Run: pnpm -C apps/web test prefill-forms.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't-1', name: 'Creative Ballet', currency: 'ILS' }) }));
vi.mock('@/hooks/useEntityLabels', () => ({
  useEntityLabels: () => ({ labels: { offering: { singular: 'Package', plural: 'Packages' } } }),
}));
vi.mock('@/features/finance-admin/hooks/useExpenses', () => ({
  useExpenseCategories: () => ({ categories: [{ id: 'c-1', name: 'Equipment', is_vat_eligible: true }] }),
  useKnownSuppliers: () => [],
}));
vi.mock('@/features/finance-admin/components/ExpenseCategorySelect', () => ({ ExpenseCategorySelect: () => null }));
vi.mock('@/features/finance-admin/services/expenseService', () => ({ ExpenseService: {} }));
vi.mock('@/features/jobs/hooks/useJobs', () => ({
  useJobPackages: () => ({
    data: [
      { id: 'p1', name: 'Family session', duration_mins: 60, price_minor: 50000, currency: 'ILS', location: 'Studio, 1 Herzl St', is_public: true },
    ],
  }),
  useConvertLead: () => ({ mutateAsync: vi.fn().mockResolvedValue('eng-9'), isPending: false }),
}));

import i18n from '@/i18n/i18n';
import { ExpenseForm } from '@/features/finance-admin/components/ExpenseForm';
import { ConvertLeadPanel } from '@/features/jobs/components/ConvertLeadPanel';
import type { Expense } from '@shared/schemas';

const wrap = (node: ReactNode) =>
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{node}</MemoryRouter>
    </I18nextProvider>,
  );

describe('expense correction', () => {
  it('starts from the corrected expense’s amount and supplier', () => {
    const original = {
      id: 'e-1',
      category_id: 'c-1',
      description: 'Mirrors',
      total_amount_minor: 117000,
      supplier_name: 'Glass Ltd',
      supplier_vat_number: '514123456',
    } as unknown as Expense;
    wrap(<ExpenseForm correctsExpense={original} onSuccess={() => {}} onCancel={() => {}} onSubmit={vi.fn()} />);
    expect(screen.getByDisplayValue('1170')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Glass Ltd')).toBeInTheDocument();
    expect(screen.getByDisplayValue('514123456')).toBeInTheDocument();
  });

  it('a new expense is dated today in local time', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 3, 23, 30));
    wrap(<ExpenseForm onSuccess={() => {}} onCancel={() => {}} onSubmit={vi.fn()} />);
    expect(screen.getByDisplayValue('2026-11-03')).toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe('lead → shoot', () => {
  it('starts on the lead’s event date at 10:00 and at the package’s location', () => {
    wrap(
      <ConvertLeadPanel leadId="l-1" leadName="Noa" defaultOfferingId="p1" eventDate="2026-12-24" onClose={() => {}} />,
    );
    const starts = screen.getByLabelText(i18n.t('pages.jobs.starts_at'));
    expect(starts).toHaveValue('2026-12-24T10:00');
    const location = screen.getByLabelText(i18n.t('pages.jobs.location'));
    expect(location).toHaveValue('Studio, 1 Herzl St');
    fireEvent.change(location, { target: { value: 'Beach' } });
    expect(location).toHaveValue('Beach');
  });

  it('the enquiry’s own location wins over the package’s', () => {
    wrap(<ConvertLeadPanel leadId="l-2" leadName="Noa" defaultOfferingId="p1" defaultLocation="Park" onClose={() => {}} />);
    expect(screen.getByLabelText(i18n.t('pages.jobs.location'))).toHaveValue('Park');
  });

  it('opens a quote for the new shoot (package preselected), so the details and pay link go out from there', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/leads']}>
          <Routes>
            <Route
              path="/admin/leads"
              element={<ConvertLeadPanel leadId="l-3" leadName="Noa" onClose={() => {}} />}
            />
            <Route path="/admin/projects/quotes/new" element={<p>quote editor</p>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pages.crm.leads.convert') }));
    await waitFor(() => expect(screen.getByText('quote editor')).toBeInTheDocument());
  });
});
