// @vitest-environment jsdom
/**
 * Prefill PR B (admin forms): what OpalSwift already knows starts the form, stays editable,
 * and never overwrites typed input.
 *  - row 8: a new class's location (most used class location, else the studio address);
 *  - row 9: a new quote from a lead / shoot (package line, shoot date, title);
 *  - row 10: a shoot payment request's total (package price still to request);
 *  - row 13: a new term (after the latest one, same length, next year label);
 *  - row 15: a new expense's supplier suggestions + VAT number.
 * Fakes only. Run: pnpm -C apps/web test prefill-admin.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { classLocation, suppliers } = vi.hoisted(() => ({
  classLocation: { value: null as string | null },
  suppliers: { value: [] as { name: string; vatNumber: string | null }[] },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({}),
    rpc: vi.fn(),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    functions: { invoke: vi.fn() },
  },
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 'tenant-1', currency: 'ILS', payment_provider: 'grow' }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));
vi.mock('../features/classes/hooks/useDefaultClassLocation', () => ({
  useDefaultClassLocation: (enabled = true) => (enabled ? classLocation.value : null),
}));
vi.mock('../features/finance-admin/hooks/useExpenses', () => ({
  useExpenseCategories: () => ({
    categories: [
      { id: 'cat-vat', name: 'Supplies', is_vat_eligible: true, is_active: true },
      { id: 'cat-novat', name: 'Fees', is_vat_eligible: false, is_active: true },
    ],
    createCategoryAsync: vi.fn(),
    isCreating: false,
  }),
  useKnownSuppliers: () => suppliers.value,
}));

import { defaultClassLocation, mostCommonLocation } from '../features/classes/lib/defaultLocation';
import { newQuoteDraft, quotePrefillFromSource } from '../features/quotes/lib/quoteDraft';
import { defaultRequestTotalMinor } from '../features/jobs/lib/jobPaymentFormat';
import { nextTermDefaults, nextYearLabel } from '../features/terms/lib/nextTerm';
import { findKnownSupplier, knownSuppliers } from '../features/finance-admin/lib/expenseSuppliers';
import { ClassForm } from '../features/classes/components/ClassForm';
import { TermForm } from '../features/terms/components/TermForm';
import { JobPaymentRequestForm } from '../features/jobs/components/JobPaymentRequestForm';
import { ExpenseForm } from '../features/finance-admin/components/ExpenseForm';

afterEach(() => {
  cleanup();
  classLocation.value = null;
  suppliers.value = [];
});

const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const valueOf = (label: string | RegExp) => (screen.getByLabelText(label) as HTMLInputElement).value;

describe('row 8: new class location', () => {
  it('picks the most used location, ignoring blanks, case and spaces; ties go to the first seen', () => {
    expect(mostCommonLocation(['Hall B', ' hall a ', null, '', 'Hall A', 'Hall B', 'hall b'])).toBe('Hall B');
    expect(mostCommonLocation(['Studio 1', 'Studio 2'])).toBe('Studio 1');
    expect(mostCommonLocation([null, '  '])).toBeNull();
  });

  it('falls back to the studio address, else nothing', () => {
    expect(defaultClassLocation(['Hall A'], '12 Herzl St')).toBe('Hall A');
    expect(defaultClassLocation([], ' 12 Herzl St ')).toBe('12 Herzl St');
    expect(defaultClassLocation([null], '')).toBeNull();
    expect(defaultClassLocation([], undefined)).toBeNull();
  });

  it('a new class starts at the default location (editable); an existing class keeps its own', () => {
    classLocation.value = 'Main hall';
    wrap(<ClassForm terms={[]} levels={[]} teachers={[]} onSubmit={vi.fn()} />);
    expect(valueOf('form.class.location')).toBe('Main hall');
    fireEvent.change(screen.getByLabelText('form.class.location'), { target: { value: 'Garden' } });
    expect(valueOf('form.class.location')).toBe('Garden');
    cleanup();

    wrap(<ClassForm classItem={{ id: 'c1', name: 'Ballet', location: null }} terms={[]} levels={[]} teachers={[]} onSubmit={vi.fn()} />);
    expect(valueOf('form.class.location')).toBe('');
  });
});

describe('row 9: new quote from a lead or a shoot', () => {
  const packages = [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Wedding Gold', price_minor: 800000 },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Mini session', price_minor: 50000 },
  ];

  it('a lead: its package line, event date (date only) and "<package> – <client>" title', () => {
    const prefill = quotePrefillFromSource({
      lead: { name: 'Dana Levi', offering_id: packages[0].id, event_date: '2027-05-20T00:00:00+00:00' },
      packages,
    });
    expect(prefill).toEqual({
      title: 'Wedding Gold – Dana Levi',
      shoot_date: '2027-05-20',
      lines: [{
        offering_id: packages[0].id, description: 'Wedding Gold', qty: 1, unit_price_minor: 800000,
        is_optional: false, is_selected: true,
      }],
    });
  });

  it('a shoot: its package and price, and the booked date in Israel time', () => {
    const prefill = quotePrefillFromSource({
      job: {
        client_name: 'Noa', offering_id: packages[1].id, package_name: 'Mini session', price_minor: 45000,
        booked_starts_at: '2027-03-10T22:30:00Z', // 00:30 on 11 March in Israel
      },
      packages,
    });
    expect(prefill.shoot_date).toBe('2027-03-11');
    expect(prefill.title).toBe('Mini session – Noa');
    expect(prefill.lines[0]).toMatchObject({ offering_id: packages[1].id, unit_price_minor: 45000 });
  });

  it('what is unknown stays blank (never blocks)', () => {
    const prefill = quotePrefillFromSource({
      lead: { name: 'Avi', offering_id: null, event_date: 'next spring' },
      packages,
    });
    expect(prefill).toEqual({ title: 'Avi', shoot_date: null, lines: [] });
    // A package the studio no longer offers: no line.
    expect(
      quotePrefillFromSource({ lead: { name: '', offering_id: 'gone', event_date: null }, packages }),
    ).toEqual({ title: null, shoot_date: null, lines: [] });
  });

  it('the draft carries the prefill; without one it is the old blank draft', () => {
    const now = new Date('2026-11-03T10:00:00Z');
    const source = { leadId: '33333333-3333-4333-8333-333333333333', engagementId: null };
    const prefill = quotePrefillFromSource({
      lead: { name: 'Dana', offering_id: packages[0].id, event_date: '2027-05-20' },
      packages,
    });
    const draft = newQuoteDraft(source, now, prefill);
    expect(draft.title).toBe('Wedding Gold – Dana');
    expect(draft.shoot_date).toBe('2027-05-20');
    expect(draft.lines).toHaveLength(1);
    expect(draft.valid_until).toBe('2026-11-17');
    expect(newQuoteDraft(source, now)).toMatchObject({ title: null, shoot_date: null, lines: [] });
  });
});

describe('row 10: shoot payment request total', () => {
  it('is the package price less what is already requested', () => {
    expect(defaultRequestTotalMinor(500000, [])).toBe(500000);
    expect(
      defaultRequestTotalMinor(500000, [
        { amount_minor: 150000, status: 'paid' },
        { amount_minor: 100000, status: 'sent' },
        { amount_minor: 90000, status: 'cancelled' },
        { amount_minor: 20000, status: 'refunded_manual' },
      ]),
    ).toBe(250000);
    expect(defaultRequestTotalMinor(500000, [{ amount_minor: 500000, status: 'pending' }])).toBeNull();
    expect(defaultRequestTotalMinor(null, [])).toBeNull();
    expect(defaultRequestTotalMinor(0, [])).toBeNull();
  });

  it('the form starts at that total, editable; without one it stays blank', () => {
    const props = { currency: 'ILS', jobDate: null, onSubmit: vi.fn(), onCancel: vi.fn(), isSubmitting: false };
    wrap(<JobPaymentRequestForm {...props} defaultTotalMinor={250050} />);
    expect(valueOf('pages.jobs.payments.form.total')).toBe('2500.5');
    fireEvent.change(screen.getByLabelText('pages.jobs.payments.form.total'), { target: { value: '100' } });
    expect(valueOf('pages.jobs.payments.form.total')).toBe('100');
    cleanup();
    wrap(<JobPaymentRequestForm {...props} />);
    expect(valueOf('pages.jobs.payments.form.total')).toBe('');
  });
});

describe('row 13: new term', () => {
  it('next year labels', () => {
    expect(nextYearLabel('2026–2027')).toBe('2027–2028');
    expect(nextYearLabel('2026-2027')).toBe('2027-2028');
    expect(nextYearLabel('2026 / 2027')).toBe('2027 / 2028');
    expect(nextYearLabel(' 2026 ')).toBe('2027');
    expect(nextYearLabel('Autumn term')).toBeNull();
    expect(nextYearLabel(null)).toBeNull();
  });

  it('starts the day after the latest term and lasts as many days (local dates)', () => {
    const terms = [
      { name: '2024–2025', start_date: '2024-09-01', end_date: '2025-06-30' },
      { name: '2025–2026', start_date: '2025-09-01', end_date: '2026-06-30' }, // 302 days
      { name: 'Summer', start_date: '2025-07-01', end_date: '2025-08-15' },
    ];
    expect(nextTermDefaults(terms)).toEqual({ name: '2026–2027', start_date: '2026-07-01', end_date: '2027-04-29' });
    // Month and year rollover; a name with no year label is left blank.
    expect(nextTermDefaults([{ name: 'Winter', start_date: '2026-12-01', end_date: '2026-12-31' }])).toEqual({
      start_date: '2027-01-01',
      end_date: '2027-01-31',
    });
    expect(nextTermDefaults([])).toEqual({});
    expect(nextTermDefaults([{ name: '2026', start_date: null, end_date: null }])).toEqual({});
  });

  it('a new term form starts from it; editing a term keeps its own values', () => {
    const existingTerms = [{ id: 't1', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31' }];
    wrap(<TermForm existingTerms={existingTerms} onSubmit={vi.fn()} />);
    expect(valueOf('form.term.name')).toBe('2027');
    expect(valueOf('form.term.start_date')).toBe('2027-01-01');
    expect(valueOf('form.term.end_date')).toBe('2027-12-31');
    cleanup();
    wrap(<TermForm term={existingTerms[0]} existingTerms={existingTerms} onSubmit={vi.fn()} />);
    expect(valueOf('form.term.name')).toBe('2026');
  });
});

describe('row 15: expense supplier', () => {
  it('known suppliers: one per name (newest spelling), VAT from the latest expense that had one', () => {
    const list = knownSuppliers([
      { supplier_name: 'Acme Ltd', supplier_vat_number: null },
      { supplier_name: 'acme  ltd ', supplier_vat_number: '514000001' },
      { supplier_name: 'ACME LTD', supplier_vat_number: '999999999' },
      { supplier_name: '  ', supplier_vat_number: '1' },
      { supplier_name: 'Paper Co', supplier_vat_number: '' },
    ]);
    expect(list).toEqual([
      { name: 'Acme Ltd', vatNumber: '514000001' },
      { name: 'Paper Co', vatNumber: null },
    ]);
    expect(findKnownSupplier(list, ' ACME   ltd')?.vatNumber).toBe('514000001');
    expect(findKnownSupplier(list, 'Acme')).toBeNull();
    expect(findKnownSupplier(list, '')).toBeNull();
  });

  const renderExpense = () =>
    wrap(<ExpenseForm onSuccess={vi.fn()} onCancel={vi.fn()} onSubmit={vi.fn()} />);
  const supplierInput = () => screen.getByLabelText('finance.expenses.supplier_name') as HTMLInputElement;
  const vatInput = () => document.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
  const chooseCategory = (id: string) =>
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: id } });

  it('suggests earlier suppliers and fills a known supplier VAT number into the empty field', () => {
    suppliers.value = [{ name: 'Acme Ltd', vatNumber: '514000001' }];
    renderExpense();
    chooseCategory('cat-vat');
    const listId = supplierInput().getAttribute('list');
    expect(listId).toBeTruthy();
    expect(document.getElementById(listId!)?.querySelector('option')?.getAttribute('value')).toBe('Acme Ltd');

    fireEvent.change(supplierInput(), { target: { value: 'acme ltd' } });
    expect(vatInput().value).toBe('514000001');
    // Still editable.
    fireEvent.change(vatInput(), { target: { value: '514000002' } });
    expect(vatInput().value).toBe('514000002');
  });

  it('never overwrites a typed VAT number; a filled one follows the name', () => {
    suppliers.value = [
      { name: 'Acme Ltd', vatNumber: '514000001' },
      { name: 'Paper Co', vatNumber: '514000009' },
    ];
    renderExpense();
    chooseCategory('cat-vat');
    fireEvent.change(vatInput(), { target: { value: '123456782' } });
    fireEvent.change(supplierInput(), { target: { value: 'Acme Ltd' } });
    expect(vatInput().value).toBe('123456782');

    fireEvent.change(vatInput(), { target: { value: '' } });
    fireEvent.change(supplierInput(), { target: { value: 'Paper Co' } });
    expect(vatInput().value).toBe('514000009');
    fireEvent.change(supplierInput(), { target: { value: 'Paper Company' } });
    expect(vatInput().value).toBe('');
  });
});
