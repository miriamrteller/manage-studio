import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { computeExpenseAmounts } from '../lib/expenseAmounts';
import { normalizeIsraeliTaxId } from '../lib/financeAdminUtils';
import { ExpenseService } from '../services/expenseService';
import { useExpenseCategories } from '../hooks/useExpenses';
import { ExpenseCategorySelect } from './ExpenseCategorySelect';
import type { Expense } from '@shared/schemas';

interface ExpenseFormProps {
  correctsExpense?: Expense | null;
  onSuccess: () => void;
  onCancel: () => void;
  onSubmit: (params: {
    input: {
      p_expense_id: string;
      p_category_id: string;
      p_description: string;
      p_pretax_amount_minor: number;
      p_vat_amount_minor: number;
      p_total_amount_minor: number;
      p_supplier_name?: string | null;
      p_supplier_vat_number?: string | null;
      p_expense_date: string;
      p_corrects_expense_id?: string | null;
    };
    receiptPath?: string | null;
  }) => Promise<void>;
}

export function ExpenseForm({ correctsExpense, onSuccess, onCancel, onSubmit }: ExpenseFormProps) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { categories } = useExpenseCategories();
  const isCorrection = Boolean(correctsExpense);

  const [categoryId, setCategoryId] = useState(correctsExpense?.category_id ?? '');
  const [description, setDescription] = useState(
    isCorrection
      ? `[Correction] ${correctsExpense?.description ?? ''}`.trim()
      : '',
  );
  const [amountInput, setAmountInput] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierVat, setSupplierVat] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const vatRate = Number(tenant?.vat_rate ?? 0.17);
  const pricesIncludeVat = tenant?.prices_include_vat ?? true;
  const amountMinor = Math.round(parseFloat(amountInput || '0') * 100);

  const breakdown = computeExpenseAmounts({
    amountMinor: isCorrection ? -Math.abs(amountMinor) : amountMinor,
    vatRate,
    pricesIncludeVat,
    isVatEligible: selectedCategory?.is_vat_eligible ?? true,
  });

  const signedBreakdown = isCorrection
    ? {
        pretaxAmountMinor: -Math.abs(breakdown.pretaxAmountMinor),
        vatAmountMinor: -Math.abs(breakdown.vatAmountMinor),
        totalAmountMinor: -Math.abs(breakdown.totalAmountMinor),
      }
    : breakdown;

  const needsSupplierVat =
    (selectedCategory?.is_vat_eligible ?? true) && signedBreakdown.vatAmountMinor !== 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenant || !categoryId) return;

    setError(null);
    setIsSubmitting(true);

    const expenseId = crypto.randomUUID();
    let receiptPath: string | null = null;

    try {
      if (receiptFile) {
        receiptPath = await ExpenseService.uploadReceipt(tenant.id, expenseId, receiptFile);
      }

      await onSubmit({
        input: {
          p_expense_id: expenseId,
          p_category_id: categoryId,
          p_description: description.trim(),
          p_pretax_amount_minor: signedBreakdown.pretaxAmountMinor,
          p_vat_amount_minor: signedBreakdown.vatAmountMinor,
          p_total_amount_minor: signedBreakdown.totalAmountMinor,
          p_supplier_name: supplierName.trim() || null,
          p_supplier_vat_number: needsSupplierVat
            ? normalizeIsraeliTaxId(supplierVat) ?? supplierVat.trim()
            : null,
          p_expense_date: expenseDate,
          p_corrects_expense_id: correctsExpense?.id ?? null,
        },
        receiptPath,
      });

      onSuccess();
    } catch (err) {
      if (receiptPath) {
        await ExpenseService.removeReceipt(receiptPath).catch(() => undefined);
      }
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      {error && <div className="alert-error" role="alert">{error}</div>}

      <ExpenseCategorySelect value={categoryId} onChange={setCategoryId} />

      <label className="block text-sm">
        <span className="block font-medium mb-1">{t('finance.expenses.description')}</span>
        <input
          className="w-full border rounded px-3 py-2"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          maxLength={500}
        />
      </label>

      <label className="block text-sm">
        <span className="block font-medium mb-1">{t('finance.expenses.amount')}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          className="w-full border rounded px-3 py-2"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          required
        />
      </label>

      <label className="block text-sm">
        <span className="block font-medium mb-1">{t('finance.expenses.supplier_name')}</span>
        <input
          className="w-full border rounded px-3 py-2"
          value={supplierName}
          onChange={(e) => setSupplierName(e.target.value)}
        />
      </label>

      {needsSupplierVat && (
        <label className="block text-sm">
          <span className="block font-medium mb-1">{t('finance.expenses.supplier_vat')}</span>
          <input
            className="w-full border rounded px-3 py-2"
            value={supplierVat}
            onChange={(e) => setSupplierVat(e.target.value)}
            required
          />
        </label>
      )}

      <label className="block text-sm">
        <span className="block font-medium mb-1">{t('finance.expenses.expense_date')}</span>
        <input
          type="date"
          className="w-full border rounded px-3 py-2"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
          required
        />
      </label>

      {!isCorrection && (
        <label className="block text-sm">
          <span className="block font-medium mb-1">{t('finance.expenses.receipt')}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
          />
        </label>
      )}

      <div className="flex gap-3">
        <Button type="submit" variant="primary" disabled={isSubmitting} isLoading={isSubmitting}>
          {t('finance.expenses.submit')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('form.cancel')}
        </Button>
      </div>
    </form>
  );
}
