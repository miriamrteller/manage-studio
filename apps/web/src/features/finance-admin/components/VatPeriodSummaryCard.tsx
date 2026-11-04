import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@shared/format';
import { useTenant } from '@/hooks/useTenant';
import { usePaidPayments, useVatReportPeriod } from '../hooks/useAccountantData';
import { accountantPeriodRange } from '../lib/periods';
import { summariseVatPeriod } from '../lib/financeCharts';

type VatChoice = 'vat_previous' | 'vat_current';

/**
 * VAT period at a glance, from the documents issued (never from business status): what came
 * in, the VAT on tax invoice-receipts, receipts without VAT, documents of unknown type, refunds,
 * and payments with no document yet. Prefilled with the last VAT period.
 */
export function VatPeriodSummaryCard() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const ids = useId();
  const { vatPeriod } = useVatReportPeriod();
  const [choice, setChoice] = useState<VatChoice>('vat_previous');
  const range = useMemo(() => accountantPeriodRange(choice, vatPeriod), [choice, vatPeriod]);
  const { data: rows, isLoading, error } = usePaidPayments(range);
  const summary = useMemo(() => (rows ? summariseVatPeriod(rows, tenant) : null), [rows, tenant]);

  const currency = tenant?.currency ?? 'ILS';
  const money = (minor: number) => formatCurrency(minor, currency, i18n.language);

  const lines: Array<{ key: string; value: string; note?: string }> = summary
    ? [
        { key: 'gross', value: money(summary.grossMinor) },
        { key: 'vat_documents', value: money(summary.vatDocumentsGrossMinor) },
        { key: 'pretax', value: money(summary.pretaxMinor) },
        { key: 'vat', value: money(summary.vatMinor) },
        { key: 'receipts', value: money(summary.receiptsMinor) },
        ...(summary.unknownTypeMinor !== 0
          ? [{ key: 'unknown_type', value: money(summary.unknownTypeMinor) }]
          : []),
        { key: 'refunds', value: money(summary.refundsMinor) },
        {
          key: 'without_document',
          value: money(summary.withoutDocumentMinor),
          note: t('finance.vat_summary.without_document_count', { count: summary.withoutDocumentCount }),
        },
      ]
    : [];

  return (
    <section className="card border border-gray-200 p-4 space-y-3" aria-labelledby={`${ids}-title`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 id={`${ids}-title`} className="text-lg font-semibold">
          {t('finance.vat_summary.title')}
        </h3>
        <label className="block text-sm" htmlFor={`${ids}-period`}>
          <span className="mb-1 block font-medium">{t('finance.accountant_export.period')}</span>
          <select
            id={`${ids}-period`}
            className="rounded border px-3 py-2"
            value={choice}
            onChange={(e) => setChoice(e.target.value as VatChoice)}
          >
            <option value="vat_previous">{t('finance.accountant_export.periods.vat_previous')}</option>
            <option value="vat_current">{t('finance.accountant_export.periods.vat_current')}</option>
          </select>
        </label>
      </div>
      <p className="text-sm text-gray-600">
        {range.startDate} – {range.endDate}
      </p>

      {error && <div className="alert-error" role="alert">{t('finance.charts.load_failed')}</div>}
      {isLoading && <p role="status">{t('common.loading')}</p>}
      {summary && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {lines.map((line) => (
            <div key={line.key} className="flex justify-between gap-3 border-b border-gray-100 py-1">
              <dt>{t(`finance.vat_summary.${line.key}`)}</dt>
              <dd className="text-end font-medium">
                {line.value}
                {line.note && <span className="block font-normal text-gray-600">{line.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* [[ACCOUNTANT: confirm]] wording (docs/plans/finance/ACCOUNTANT-VIEW.md). */}
      <p className="text-xs text-gray-600">{t('finance.vat_summary.note')}</p>
    </section>
  );
}
