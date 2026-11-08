import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@shared/format';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { TIMEZONE } from '@/lib/constants';
import { useExpenseCategories } from '../hooks/useExpenses';
import { expenseCategoryName, expenseLanguage } from '../lib/expenseCategoryName';
import {
  FIELD_KEYS,
  buildImportRows,
  cellText,
  distinctValues,
  findHeaderRow,
  guessColumns,
  guessKindValue,
  guessSheetKind,
  hasAmbiguousDates,
  headerNames,
  normalise,
  rowFingerprint,
  type CategoryChoice,
  type ColumnMapping,
  type FieldKey,
  type KindChoice,
  type SheetKind,
} from './importRows';
import { readSpreadsheet, SpreadsheetError, type SheetData } from './readSpreadsheet';
import { FinanceImportService, type ImportResult } from './financeImportService';

const SHEET_KINDS: SheetKind[] = ['mixed', 'expenses', 'income', 'receipts'];
const NEW_CATEGORY = '__new__';

function todayInJerusalem(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

interface LoadedFile {
  file: File;
  sheets: SheetData[];
}

/** Import a studio's own income and expenses spreadsheet (CSV or Excel). */
export function FinanceImport() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const currency = tenant?.currency ?? 'ILS';
  const lang = expenseLanguage(i18n.language);

  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [columns, setColumns] = useState<ColumnMapping[]>([]);
  const [sheetKind, setSheetKind] = useState<SheetKind>('mixed');
  const [kindOverrides, setKindOverrides] = useState<Record<string, KindChoice>>({});
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, CategoryChoice>>({});
  const [dayFirst, setDayFirst] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dismissedRepeat, setDismissedRepeat] = useState(false);

  const { categories } = useExpenseCategories();
  const activeCategories = categories.filter((c) => c.is_active);

  const batchesQuery = useQuery({
    queryKey: ['finance-import-batches', tenant?.id],
    queryFn: () => FinanceImportService.listBatches(tenant!.id),
    enabled: !!tenant?.id,
  });

  const sheet = loaded?.sheets[sheetIndex] ?? null;
  const headerRow = sheet ? findHeaderRow(sheet.rows) : 0;
  const colOf = (field: FieldKey) => columns.find((c) => c.field === field)?.index;

  const chooseSheet = (data: LoadedFile, index: number) => {
    const rows = data.sheets[index]?.rows ?? [];
    const hRow = findHeaderRow(rows);
    const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
    const guessed = guessColumns(headerNames(rows[hRow] ?? [], width));
    setSheetIndex(index);
    setColumns(guessed);
    setSheetKind(guessSheetKind(guessed));
    setKindOverrides({});
    setCategoryOverrides({});
    setDayFirst(true);
    setResult(null);
    setDismissedRepeat(false);
  };

  const handleFile = async (file: File | undefined) => {
    setReadError(null);
    setResult(null);
    if (!file) return;
    try {
      const sheets = (await readSpreadsheet(file)).filter((s) => s.rows.some((r) => r.some((c) => cellText(c) !== '')));
      if (sheets.length === 0) {
        setReadError(t('finance.import.error_empty'));
        setLoaded(null);
        return;
      }
      const data = { file, sheets };
      setLoaded(data);
      chooseSheet(data, 0);
    } catch (err) {
      const code = err instanceof SpreadsheetError ? err.code : 'unreadable';
      setReadError(t(`finance.import.error_${code}`));
      setLoaded(null);
    }
  };

  // Values of the income/expense column, with prefilled meanings.
  const kindValues = useMemo(() => {
    const col = colOf('kind');
    if (!sheet || col === undefined) return [];
    return distinctValues(sheet.rows, headerRow, col).filter((v) => v.key !== '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, headerRow, columns]);
  const kindChoices = useMemo(() => {
    const out: Record<string, KindChoice> = {};
    for (const v of kindValues) out[v.key] = kindOverrides[v.key] ?? guessKindValue(v.label);
    return out;
  }, [kindValues, kindOverrides]);

  // Category values on expense rows, matched to the studio's categories or added as new.
  const categoryValues = useMemo(() => {
    const col = colOf('category');
    if (!sheet || sheetKind === 'income' || sheetKind === 'receipts') return [];
    const kindCol = colOf('kind');
    const expenseRows =
      sheetKind === 'mixed'
        ? sheet.rows.filter((r, i) => i <= headerRow || kindChoices[normalise(r[kindCol ?? -1])] === 'expense')
        : sheet.rows;
    const values = col === undefined ? [] : distinctValues(expenseRows, headerRow, col);
    if (!values.some((v) => v.key === '')) values.push({ key: '', label: '', count: 0 });
    return values;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, headerRow, columns, sheetKind, kindChoices]);

  const fallbackCategory = activeCategories.find((c) => c.catalog_key === 'other') ?? activeCategories[0];
  const categoryChoices = useMemo(() => {
    const out: Record<string, CategoryChoice> = {};
    for (const v of categoryValues) {
      if (categoryOverrides[v.key]) {
        out[v.key] = categoryOverrides[v.key];
        continue;
      }
      const match = activeCategories.find(
        (c) =>
          normalise(c.name) === v.key ||
          (c.catalog && (normalise(c.catalog.name_en) === v.key || normalise(c.catalog.name_he) === v.key)),
      );
      if (match) out[v.key] = { categoryId: match.id };
      else if (v.key === '' && fallbackCategory) out[v.key] = { categoryId: fallbackCategory.id };
      else out[v.key] = { newName: v.label || t('finance.import.other_category') };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryValues, categoryOverrides, categories]);

  const showDateOrder = useMemo(() => {
    const col = colOf('date');
    return !!sheet && col !== undefined && hasAmbiguousDates(sheet.rows, headerRow, col);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, headerRow, columns]);

  const built = useMemo(() => {
    if (!sheet) return null;
    return buildImportRows(
      sheet.rows,
      headerRow,
      { sheetKind, columns, kindValues: kindChoices, categoryChoices, dayFirst },
      todayInJerusalem(),
      currency,
    );
  }, [sheet, headerRow, sheetKind, columns, kindChoices, categoryChoices, dayFirst, currency]);

  const fileFingerprint = loaded && sheet
    ? rowFingerprint([loaded.file.name, String(loaded.file.size), String(loaded.file.lastModified), sheet.name])
    : '';
  const earlierImport = batchesQuery.data?.find((b) => b.file_fingerprint === fileFingerprint && !b.undone_at);

  const importMutation = useMutation({
    mutationFn: () =>
      FinanceImportService.importRows({
        fileName: loaded!.file.name,
        sheetName: loaded!.sheets.length > 1 ? sheet!.name : null,
        fileFingerprint,
        mapping: Object.fromEntries(columns.map((c) => [c.header, c.field])),
        rows: built!.rows,
      }),
    onSuccess: (res) => {
      setResult(res);
      invalidateFinance();
    },
  });

  const undoMutation = useMutation({
    mutationFn: (batchId: string) => FinanceImportService.undo(batchId),
    onSuccess: (_, batchId) => {
      if (result?.batch_id === batchId) setResult(null);
      invalidateFinance();
    },
  });

  function invalidateFinance() {
    void queryClient.invalidateQueries({ queryKey: ['finance-import-batches', tenant?.id] });
    void queryClient.invalidateQueries({ queryKey: ['expense-categories', tenant?.id] });
    void queryClient.invalidateQueries({ queryKey: ['expenses', tenant?.id] });
    void queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
  }

  const setField = (index: number, field: FieldKey) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.index === index) return { ...c, field };
        // A field like Date can only come from one column: the old one keeps its own name instead.
        if (field !== 'extra' && field !== 'skip' && c.field === field) return { ...c, field: 'extra' };
        return c;
      }),
    );
  };

  const money = (minor: number) => formatCurrency(minor, currency, i18n.language);
  const totalRows = built ? built.rows.length : 0;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold">{t('finance.import.title')}</h1>
        <p className="text-gray-600">{t('finance.import.intro')}</p>
        <p className="text-sm text-gray-600">{t('finance.import.google_sheets_hint')}</p>
      </section>

      <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="note">
        <p>{t('finance.import.notice_history')}</p>
        <p>{t('finance.import.notice_permission')}</p>
      </div>

      <section className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t('finance.import.choose_file')}</span>
          <input
            type="file"
            accept=".csv,.xlsx,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </label>
        {readError && (
          <div className="alert-error" role="alert">
            {readError}
          </div>
        )}
        {loaded && loaded.sheets.length > 1 && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t('finance.import.choose_sheet')}</span>
            <select
              className="rounded border px-3 py-2"
              value={sheetIndex}
              onChange={(e) => chooseSheet(loaded, Number(e.target.value))}
            >
              {loaded.sheets.map((s, i) => (
                <option key={s.name + i} value={i}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-gray-600">{t('finance.import.sheet_hint')}</span>
          </label>
        )}
      </section>

      {sheet && built && !result && (
        <>
          {earlierImport && !dismissedRepeat && (
            <div className="flex items-start justify-between gap-4 rounded border border-blue-200 bg-blue-50 p-4 text-sm" role="status">
              <p>
                {t('finance.import.already_imported', {
                  date: new Date(earlierImport.created_at).toLocaleDateString(i18n.language),
                })}
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDismissedRepeat(true)}>
                {t('common.close')}
              </Button>
            </div>
          )}

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t('finance.import.columns_title')}</h2>
            <p className="text-sm text-gray-600">{t('finance.import.columns_hint')}</p>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-start">{t('finance.import.col_sheet_column')}</th>
                    <th className="px-3 py-2 text-start">{t('finance.import.col_example')}</th>
                    <th className="px-3 py-2 text-start">{t('finance.import.col_goes_to')}</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((c) => (
                    <tr key={c.index}>
                      <td className="px-3 py-2 font-medium" dir="auto">
                        {c.header}
                      </td>
                      <td className="px-3 py-2 text-gray-600" dir="auto">
                        {exampleValue(sheet.rows, headerRow, c.index)}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="rounded border px-2 py-1"
                          aria-label={t('finance.import.col_goes_to_for', { column: c.header })}
                          value={c.field}
                          onChange={(e) => setField(c.index, e.target.value as FieldKey)}
                        >
                          {FIELD_KEYS.map((f) => (
                            <option key={f} value={f}>
                              {t(`finance.import.field.${f}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {sheetKind === 'mixed' && kindValues.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">{t('finance.import.kinds_title')}</h2>
              <ul className="space-y-2 text-sm">
                {kindValues.map((v) => (
                  <li key={v.key} className="flex flex-wrap items-center gap-3">
                    <span className="min-w-[8rem] font-medium" dir="auto">
                      {v.label}
                    </span>
                    <span className="text-gray-600">{t('finance.import.rows_count', { count: v.count })}</span>
                    <select
                      className="rounded border px-2 py-1"
                      aria-label={t('finance.import.kind_for', { value: v.label })}
                      value={kindChoices[v.key]}
                      onChange={(e) => setKindOverrides((p) => ({ ...p, [v.key]: e.target.value as KindChoice }))}
                    >
                      <option value="income">{t('finance.import.kind.income')}</option>
                      <option value="expense">{t('finance.import.kind.expense')}</option>
                      <option value="skip">{t('finance.import.kind.skip')}</option>
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {built.totals.expense.count > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">{t('finance.import.categories_title')}</h2>
              <p className="text-sm text-gray-600">{t('finance.import.categories_hint')}</p>
              <ul className="space-y-2 text-sm">
                {categoryValues
                  .filter((v) => v.count > 0 || v.key === '')
                  .map((v) => {
                    const choice = categoryChoices[v.key];
                    const value = choice && 'categoryId' in choice ? choice.categoryId : NEW_CATEGORY;
                    return (
                      <li key={v.key} className="flex flex-wrap items-center gap-3">
                        <span className="min-w-[8rem] font-medium" dir="auto">
                          {v.label || t('finance.import.no_category')}
                        </span>
                        {v.count > 0 && (
                          <span className="text-gray-600">{t('finance.import.rows_count', { count: v.count })}</span>
                        )}
                        <select
                          className="rounded border px-2 py-1"
                          aria-label={t('finance.import.category_for', { value: v.label || t('finance.import.no_category') })}
                          value={value}
                          onChange={(e) =>
                            setCategoryOverrides((p) => ({
                              ...p,
                              [v.key]:
                                e.target.value === NEW_CATEGORY
                                  ? { newName: v.label || t('finance.import.other_category') }
                                  : { categoryId: e.target.value },
                            }))
                          }
                        >
                          <option value={NEW_CATEGORY}>
                            {t('finance.import.add_category', { name: v.label || t('finance.import.other_category') })}
                          </option>
                          {activeCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {expenseCategoryName(c, lang)}
                            </option>
                          ))}
                        </select>
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}

          <details className="rounded border p-4 text-sm">
            <summary className="cursor-pointer font-medium">{t('finance.import.details_filled')}</summary>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1 block font-medium">{t('finance.import.sheet_kind_label')}</span>
                <select
                  className="rounded border px-2 py-1"
                  value={sheetKind}
                  onChange={(e) => setSheetKind(e.target.value as SheetKind)}
                >
                  {SHEET_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`finance.import.sheet_kind.${k}`)}
                    </option>
                  ))}
                </select>
              </label>
              {showDateOrder && (
                <label className="block">
                  <span className="mb-1 block font-medium">{t('finance.import.date_order_label')}</span>
                  <select
                    className="rounded border px-2 py-1"
                    value={dayFirst ? 'day' : 'month'}
                    onChange={(e) => setDayFirst(e.target.value === 'day')}
                  >
                    <option value="day">{t('finance.import.date_order_day')}</option>
                    <option value="month">{t('finance.import.date_order_month')}</option>
                  </select>
                </label>
              )}
            </div>
          </details>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t('finance.import.preview_title')}</h2>
            <ul className="space-y-1 text-sm">
              {built.totals.income.count > 0 && (
                <li>{t('finance.import.preview_income', { count: built.totals.income.count, total: money(built.totals.income.minor) })}</li>
              )}
              {built.totals.receipt.count > 0 && (
                <li>{t('finance.import.preview_receipts', { count: built.totals.receipt.count, total: money(built.totals.receipt.minor) })}</li>
              )}
              {built.totals.expense.count > 0 && (
                <li>{t('finance.import.preview_expenses', { count: built.totals.expense.count, total: money(built.totals.expense.minor) })}</li>
              )}
              {built.leftOut > 0 && <li>{t('finance.import.preview_left_out', { count: built.leftOut })}</li>}
            </ul>
            {built.problems.length > 0 && (
              <details className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <summary className="cursor-pointer">
                  {t('finance.import.problems_summary', { count: built.problems.length })}
                </summary>
                <ul className="mt-2 space-y-0.5">
                  {built.problems.slice(0, 50).map((p) => (
                    <li key={p.rowNumber}>
                      {t('finance.import.problem_row', { row: p.rowNumber, reason: t(`finance.import.problem.${p.code}`) })}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {importMutation.error && (
              <div className="alert-error" role="alert">
                {t('finance.import.error_import', { message: importMutation.error.message })}
              </div>
            )}
            <Button
              type="button"
              variant="primary"
              disabled={totalRows === 0}
              isLoading={importMutation.isPending}
              onClick={() => importMutation.mutate()}
            >
              {t('finance.import.import_button', { count: totalRows })}
            </Button>
          </section>
        </>
      )}

      {result && (
        <section className="space-y-3 rounded border border-green-200 bg-green-50 p-4" role="status">
          <h2 className="text-xl font-semibold">{t('finance.import.done_title')}</h2>
          <ul className="space-y-1 text-sm">
            <li>{t('finance.import.done_income', { count: result.income })}</li>
            <li>{t('finance.import.done_expenses', { count: result.expenses })}</li>
            {result.receipts_matched > 0 && <li>{t('finance.import.done_receipts', { count: result.receipts_matched })}</li>}
            {result.new_categories > 0 && <li>{t('finance.import.done_categories', { count: result.new_categories })}</li>}
            {result.skipped > 0 && <li>{t('finance.import.done_skipped', { count: result.skipped })}</li>}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/finance?period=year_current" className="text-sm font-medium text-primary underline">
              {t('finance.import.see_profit')}
            </Link>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('finance.import.history_title')}</h2>
        {undoMutation.error && (
          <div className="alert-error" role="alert">
            {undoMutation.error.message}
          </div>
        )}
        {batchesQuery.data && batchesQuery.data.length === 0 && (
          <p className="text-sm text-gray-600">{t('finance.import.history_empty')}</p>
        )}
        {batchesQuery.data && batchesQuery.data.length > 0 && (
          <ul className="space-y-2 text-sm">
            {batchesQuery.data.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3">
                <div>
                  <p className="font-medium" dir="auto">
                    {b.sheet_name ? `${b.file_name} · ${b.sheet_name}` : b.file_name}
                  </p>
                  <p className="text-gray-600">
                    {t('finance.import.history_line', {
                      date: new Date(b.created_at).toLocaleDateString(i18n.language),
                      income: b.income_count,
                      expenses: b.expense_count,
                      receipts: b.receipts_matched_count,
                    })}
                    {b.undone_at && ` · ${t('finance.import.history_undone')}`}
                  </p>
                </div>
                {!b.undone_at && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isLoading={undoMutation.isPending && undoMutation.variables === b.id}
                    onClick={() => {
                      if (window.confirm(t('finance.import.undo_confirm'))) undoMutation.mutate(b.id);
                    }}
                  >
                    {t('finance.import.undo')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function exampleValue(rows: SheetData['rows'], headerRow: number, col: number): string {
  for (const row of rows.slice(headerRow + 1)) {
    const v = cellText(row[col]);
    if (v) return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  }
  return '';
}
