import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { computeExpenseAmounts } from '../lib/expenseAmounts';
import { normalizeIsraeliTaxId } from '../lib/financeAdminUtils';
import { ExpenseService } from '../services/expenseService';
import { useExpenseCategories, useKnownSuppliers } from '../hooks/useExpenses';
import { findKnownSupplier } from '../lib/expenseSuppliers';
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

/** YYYY-MM-DD for a date in local time. */
export function localDateString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
  // A correction reverses the expense it corrects: start from its amount and supplier (editable).
  const [amountInput, setAmountInput] = useState(() =>
    correctsExpense ? String(Math.abs(correctsExpense.total_amount_minor) / 100) : '',
  );
  const [supplierName, setSupplierName] = useState(correctsExpense?.supplier_name ?? '');
  const [supplierVat, setSupplierVat] = useState(correctsExpense?.supplier_vat_number ?? '');
  // Today in the studio's local time (toISOString is UTC: late evening in Israel gave yesterday).
  const [expenseDate, setExpenseDate] = useState(() => localDateString());
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCategory = categories.find((c) => c.id === categoryId);

  // Earlier suppliers: suggest their names; a known name fills its VAT number into an empty field.
  const suppliers = useKnownSuppliers();
  const supplierListId = useId();
  const vatVisible = Boolean(selectedCategory?.is_vat_eligible);
  const knownVat = findKnownSupplier(suppliers, supplierName)?.vatNumber ?? null;
  // What we filled last: replaced when the name changes, but typed VAT numbers are never touched.
  const autoVatRef = useRef<string | null>(null);
  useEffect(() => {
    const next = vatVisible && knownVat ? knownVat : '';
    const previousAuto = autoVatRef.current;
    if (!next && !previousAuto) return;
    setSupplierVat((current) => (!current.trim() || current === previousAuto ? next : current));
    autoVatRef.current = next || null;
  }, [vatVisible, knownVat]);

  const amountMinor = Math.round(parseFloat(amountInput || '0') * 100);

  const breakdown = computeExpenseAmounts({
    amountMinor: isCorrection ? -Math.abs(amountMinor) : amountMinor,
  });

  const signedBreakdown = isCorrection
    ? {
        pretaxAmountMinor: -Math.abs(breakdown.pretaxAmountMinor),
        vatAmountMinor: -Math.abs(breakdown.vatAmountMinor),
        totalAmountMinor: -Math.abs(breakdown.totalAmountMinor),
      }
    : breakdown;

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
          p_supplier_vat_number: supplierVat.trim()
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
          list={suppliers.length > 0 ? supplierListId : undefined}
          autoComplete="off"
        />
        {suppliers.length > 0 && (
          <datalist id={supplierListId}>
            {suppliers.map((s) => (
              <option key={s.name} value={s.name} />
            ))}
          </datalist>
        )}
      </label>

      {vatVisible && (
        <label className="block text-sm">
          <span className="block font-medium mb-1">{t('finance.expenses.supplier_vat')}</span>
          <input
            className="w-full border rounded px-3 py-2"
            value={supplierVat}
            onChange={(e) => setSupplierVat(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
          />
          <span className="block text-muted-foreground mt-1">{t('finance.expenses.supplier_vat_hint')}</span>
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
