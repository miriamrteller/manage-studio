// @vitest-environment jsdom
/**
 * Expense categories in English and Hebrew: common categories show in the reader's
 * language, the studio's own keep their typed name, and the categories page lists
 * the skin's set first with on/off switches.
 * Run: pnpm -C apps/web test expense-categories-catalog.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { ExpenseCategory } from '@shared/schemas';

const item = (key: string, name_en: string, name_he: string, sort_order: number) => ({
  key,
  name_en,
  name_he,
  is_vat_eligible: true,
  sort_order,
});

const h = vi.hoisted(() => ({
  categories: [] as Partial<ExpenseCategory>[],
  setCatalogEnabled: vi.fn(),
}));

vi.mock('@/features/finance-admin/hooks/useExpenses', () => ({
  useExpenseCatalog: () => ({
    suggested: [item('rent', 'Rent', 'שכירות', 10), item('costumes', 'Costumes and performances', 'תלבושות והופעות', 220)],
    more: [item('printing', 'Printing and albums', 'הדפסות ואלבומים', 260)],
    isLoading: false,
    error: null,
  }),
  useExpenseCategories: () => ({
    categories: h.categories,
    isLoading: false,
    error: null,
    setCatalogEnabled: h.setCatalogEnabled,
    isSwitching: false,
    switchError: null,
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
  }),
}));

import i18n from '@/i18n/i18n';
import { ExpenseCategoriesList } from '@/features/finance-admin/components/ExpenseCategoriesList';
import { buildExpensesCsv } from '@/features/finance-admin/lib/csvExport';
import { expenseCategoryName, splitExpenseCatalog } from '@/features/finance-admin/lib/expenseCategoryName';

const row = (over: Partial<ExpenseCategory>): Partial<ExpenseCategory> => ({
  id: 'c1',
  tenant_id: 't1',
  name: 'שכירות',
  is_vat_eligible: true,
  is_active: true,
  sort_order: 10,
  catalog_key: null,
  catalog: null,
  ...over,
});

const show = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <ExpenseCategoriesList />
    </I18nextProvider>,
  );

beforeEach(() => {
  h.categories = [row({ catalog_key: 'rent', catalog: { name_en: 'Rent', name_he: 'שכירות' } }), row({ id: 'c2', name: 'Pointe shoes' })];
});
afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('names', () => {
  it('a common category shows in the reader’s language; the studio’s own keeps its name', () => {
    const rent = { name: 'שכירות סטודיו', catalog: { name_en: 'Rent', name_he: 'שכירות' } };
    expect(expenseCategoryName(rent, 'en')).toBe('Rent');
    expect(expenseCategoryName(rent, 'he')).toBe('שכירות');
    expect(expenseCategoryName({ name: 'Pointe shoes', catalog: null }, 'he')).toBe('Pointe shoes');
    expect(expenseCategoryName(null, 'en')).toBe('');
  });

  it('the skin’s set comes first; a skin with no list uses the generic one', () => {
    const catalog = [item('other', 'Other', 'אחר', 1000), item('rent', 'Rent', 'שכירות', 10), item('printing', 'Printing', 'הדפסות', 260)];
    expect(splitExpenseCatalog(catalog, ['printing', 'other'], ['rent']).suggested.map((c) => c.key)).toEqual(['printing', 'other']);
    const generic = splitExpenseCatalog(catalog, null, ['rent']);
    expect(generic.suggested.map((c) => c.key)).toEqual(['rent']);
    expect(generic.more.map((c) => c.key)).toEqual(['printing', 'other']);
  });

  it('the expenses CSV uses the file’s language for common categories', () => {
    const expense = {
      id: 'e1',
      tenant_id: 't1',
      category_id: 'c1',
      description: 'May rent',
      pretax_amount_minor: 100000,
      vat_amount_minor: 0,
      total_amount_minor: 100000,
      currency: 'ILS',
      supplier_name: null,
      supplier_vat_number: null,
      receipt_storage_path: null,
      expense_date: '2026-05-01',
      corrects_expense_id: null,
      created_by: 'u1',
      created_at: '2026-05-01T00:00:00Z',
      category: { name: 'שכירות', catalog: { name_en: 'Rent', name_he: 'שכירות' } },
    };
    expect(buildExpensesCsv([expense], i18n.getFixedT('en'))).toContain('Rent');
    expect(buildExpensesCsv([expense], i18n.getFixedT('he'))).toContain('שכירות');
  });
});

describe('Expense categories page', () => {
  it('lists the skin’s set with switches; on means the studio uses it', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Common categories' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Rent' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Costumes and performances' })).not.toBeChecked();
    expect(screen.getByText('More categories')).toBeInTheDocument();
    // The table shows the common category in English, the studio's own as typed.
    expect(screen.getByRole('cell', { name: 'Rent' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Pointe shoes' })).toBeInTheDocument();
  });

  it('switching one on or off saves it', () => {
    show();
    fireEvent.click(screen.getByRole('switch', { name: 'Costumes and performances' }));
    expect(h.setCatalogEnabled).toHaveBeenCalledWith(expect.objectContaining({ key: 'costumes' }), true);
    fireEvent.click(screen.getByRole('switch', { name: 'Rent' }));
    expect(h.setCatalogEnabled).toHaveBeenCalledWith(expect.objectContaining({ key: 'rent' }), false);
  });

  it('is in Hebrew too', async () => {
    await i18n.changeLanguage('he');
    show();
    expect(screen.getByRole('heading', { name: 'קטגוריות נפוצות' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'תלבושות והופעות' })).toBeInTheDocument();
    expect(screen.getByText('מתאימות לסוג העסק שלכם')).toBeInTheDocument();
  });
});
