import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@shared/format';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { FilterMultiSelect, type FilterOption } from '@/components/shared/table';
import { useTenant } from '@/hooks/useTenant';
import { useExpenses, useExpenseCategories } from '../hooks/useExpenses';
import { ExpenseForm } from './ExpenseForm';
import { ExpenseService } from '../services/expenseService';
import { exportExpensesCsv } from '../lib/csvExport';
import type { Expense } from '@shared/schemas';

export function ExpensesList() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<FilterOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [correctingExpense, setCorrectingExpense] = useState<Expense | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const filters = {
    dateFrom,
    dateTo,
    categoryIds: selectedCategories.map((c) => c.value),
  };

  const {
    expenses,
    totalCount,
    pageSize,
    isLoading,
    error,
    createExpense,
    refetch,
  } = useExpenses({ page, filters });

  const { categories: allCategories } = useExpenseCategories();

  const categoryOptions: FilterOption[] = allCategories.map((cat) => ({
    value: cat.id,
    label: cat.name,
  }));

  const handleExport = async () => {
    if (!tenant) return;
    setExportError(null);
    try {
      const { totalCount: exportTotal } = await ExpenseService.list(tenant, {
        page: 1,
        pageSize: 1,
        filters,
      });
      if (exportTotal > 5000) {
        setExportError(t('finance.export.too_many'));
        return;
      }
      const { rows } = await ExpenseService.list(tenant, {
        page: 1,
        pageSize: 5000,
        filters,
      });
      exportExpensesCsv(rows, `expenses-${tenant.subdomain}.csv`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('finance.expenses.title')}</h1>
          <Link to="/admin/finance/expenses/categories" className="text-sm text-primary">
            {t('finance.expenses.categories_link')}
          </Link>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>{t('finance.expenses.export')}</Button>
          <Button variant="primary" onClick={() => setShowForm(true)}>
            {t('finance.expenses.add')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="block text-sm">
          <span className="block font-medium mb-1">{t('finance.expenses.filter_date_from')}</span>
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={dateFrom ?? ''}
            onChange={(e) => {
              setDateFrom(e.target.value || null);
              setPage(1);
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium mb-1">{t('finance.expenses.filter_date_to')}</span>
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={dateTo ?? ''}
            onChange={(e) => {
              setDateTo(e.target.value || null);
              setPage(1);
            }}
          />
        </label>
        <FilterMultiSelect
          id="expense-category-filter"
          label={t('finance.expenses.filter_category')}
          options={categoryOptions}
          selected={selectedCategories}
          onChange={(selected) => {
            setSelectedCategories(selected);
            setPage(1);
          }}
        />
      </div>

      {exportError && <div className="alert-error" role="alert">{exportError}</div>}
      {isLoading && <p role="status">{t('common.loading')}</p>}
      {error && <div className="alert-error" role="alert">{error.message}</div>}

      {!isLoading && expenses.length === 0 && (
        <EmptyState title={t('finance.expenses.empty')} message="" />
      )}

      {expenses.length > 0 && (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm" aria-label={t('finance.expenses.table_label')}>
              <thead>
                <tr>
                  <th className="px-3 py-2 text-start">{t('finance.expenses.col_date')}</th>
                  <th className="px-3 py-2 text-start">{t('finance.expenses.col_category')}</th>
                  <th className="px-3 py-2 text-start">{t('finance.expenses.col_description')}</th>
                  <th className="px-3 py-2 text-start">{t('finance.expenses.col_total')}</th>
                  <th className="px-3 py-2 text-start">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="px-3 py-2">{expense.expense_date}</td>
                    <td className="px-3 py-2">{expense.category?.name ?? '—'}</td>
                    <td className="px-3 py-2">{expense.description}</td>
                    <td className="px-3 py-2">
                      {formatCurrency(expense.total_amount_minor, expense.currency, i18n.language)}
                    </td>
                    <td className="px-3 py-2">
                      {!expense.corrects_expense_id && expense.total_amount_minor > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setCorrectingExpense(expense)}
                        >
                          {t('finance.expenses.correction_title')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t('common.previous')}
            </Button>
            <Button
              variant="outline"
              disabled={page * pageSize >= totalCount}
              onClick={() => setPage(page + 1)}
            >
              {t('common.next')}
            </Button>
          </div>
        </>
      )}

      {(showForm || correctingExpense) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-lg">
            <div className="border-b p-4">
              <h2 className="text-xl font-semibold">
                {correctingExpense
                  ? t('finance.expenses.correction_title')
                  : t('finance.expenses.form_title')}
              </h2>
            </div>
            <ExpenseForm
              correctsExpense={correctingExpense}
              onCancel={() => {
                setShowForm(false);
                setCorrectingExpense(null);
              }}
              onSuccess={() => {
                setShowForm(false);
                setCorrectingExpense(null);
                refetch();
              }}
              onSubmit={async (params) => {
                await createExpense(params);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
