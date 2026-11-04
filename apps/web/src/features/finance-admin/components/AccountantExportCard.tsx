import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { PaymentsLogService } from '../services/paymentsLogService';
import { useVatReportPeriod } from '../hooks/useAccountantData';
import {
  ACCOUNTANT_PERIOD_KEYS,
  accountantPeriodRange,
  parseVatReportPeriod,
  type AccountantPeriodKey,
} from '../lib/periods';
import { fetchAllPages } from '../lib/pagedFetch';
import { ACCOUNTANT_EXPORT_STATUSES, buildAccountantCsv } from '../lib/accountantExport';
import { downloadCsv } from '../lib/csvExport';
import { datedCsvFilename } from '../lib/financeAdminUtils';
import { csvT, useCsvLanguage } from '../lib/csvLanguage';
import { CsvLanguageSelect } from './CsvLanguageSelect';

type PeriodChoice = AccountantPeriodKey | 'custom';

/**
 * "For your accountant": one CSV of every payment and refund in a period, with its tax
 * document or the reason there is none. The period is prefilled with the last VAT period
 * (from the studio's VAT reporting setting, itself prefilled "every 2 months"); everything
 * is editable and nothing blocks the download.
 */
export function AccountantExportCard() {
  const { t, i18n } = useTranslation();
  const { language, setLanguage } = useCsvLanguage(i18n.language);
  const tenant = useTenant();
  const ids = useId();

  const { vatPeriod, setVatPeriod } = useVatReportPeriod();

  const [choice, setChoice] = useState<PeriodChoice>('vat_previous');
  const initial = accountantPeriodRange('vat_previous', vatPeriod);
  const [from, setFrom] = useState(initial.startDate);
  const [to, setTo] = useState(initial.endDate);

  // Keep the dates in step with the preset (and with the VAT setting once it loads).
  useEffect(() => {
    if (choice === 'custom') return;
    const range = accountantPeriodRange(choice, vatPeriod);
    setFrom(range.startDate);
    setTo(range.endDate);
  }, [choice, vatPeriod]);

  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!tenant) return;
    setError(null);
    setMessage(null);
    setProgress(0);
    try {
      const filters = { statuses: ACCOUNTANT_EXPORT_STATUSES, dateFrom: from || null, dateTo: to || null };
      const rows = await fetchAllPages(
        (page, pageSize) =>
          PaymentsLogService.list(tenant, { page, pageSize, filters, forExport: true }),
        { onProgress: (fetched) => setProgress(fetched) },
      );
      if (rows.length === 0) {
        setMessage(t('finance.accountant_export.empty'));
        return;
      }
      const inExport = new Set(rows.map((r) => r.id));
      const missingOriginals = [
        ...new Set(
          rows.map((r) => r.refunds_payment_id).filter((id): id is string => !!id && !inExport.has(id)),
        ),
      ];
      const originalDocumentNumbers = missingOriginals.length
        ? await PaymentsLogService.documentNumbersByPaymentIds(tenant, missingOriginals)
        : undefined;
      const csv = buildAccountantCsv(rows, { tenant, originalDocumentNumbers, t: csvT(i18n, language) });
      downloadCsv(csv, datedCsvFilename(`accountant-${from}-${to}`, tenant.subdomain));
    } catch {
      setError(t('finance.export.failed'));
    } finally {
      setProgress(null);
    }
  };

  return (
    <section
      className="space-y-3 rounded border border-gray-200 bg-white p-4"
      aria-labelledby={`${ids}-title`}
    >
      <h2 id={`${ids}-title`} className="text-lg font-semibold">
        {t('finance.accountant_export.title')}
      </h2>
      <p className="text-sm text-gray-700">{t('finance.accountant_export.intro')}</p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm" htmlFor={`${ids}-period`}>
          <span className="mb-1 block font-medium">{t('finance.accountant_export.period')}</span>
          <select
            id={`${ids}-period`}
            className="rounded border px-3 py-2"
            value={choice}
            onChange={(e) => setChoice(e.target.value as PeriodChoice)}
          >
            {ACCOUNTANT_PERIOD_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`finance.accountant_export.periods.${key}`)}
              </option>
            ))}
            <option value="custom">{t('finance.accountant_export.periods.custom')}</option>
          </select>
        </label>

        <label className="block text-sm" htmlFor={`${ids}-from`}>
          <span className="mb-1 block font-medium">{t('finance.accountant_export.from')}</span>
          <input
            id={`${ids}-from`}
            type="date"
            className="rounded border px-3 py-2"
            value={from}
            onChange={(e) => {
              setChoice('custom');
              setFrom(e.target.value);
            }}
          />
        </label>

        <label className="block text-sm" htmlFor={`${ids}-to`}>
          <span className="mb-1 block font-medium">{t('finance.accountant_export.to')}</span>
          <input
            id={`${ids}-to`}
            type="date"
            className="rounded border px-3 py-2"
            value={to}
            onChange={(e) => {
              setChoice('custom');
              setTo(e.target.value);
            }}
          />
        </label>

        <label className="block text-sm" htmlFor={`${ids}-vat`}>
          <span className="mb-1 block font-medium">{t('finance.accountant_export.vat_period')}</span>
          <select
            id={`${ids}-vat`}
            className="rounded border px-3 py-2"
            value={vatPeriod}
            onChange={(e) => setVatPeriod(parseVatReportPeriod(e.target.value))}
          >
            <option value="bi_monthly">{t('finance.accountant_export.vat_period_options.bi_monthly')}</option>
            <option value="monthly">{t('finance.accountant_export.vat_period_options.monthly')}</option>
          </select>
        </label>

        <CsvLanguageSelect value={language} onChange={setLanguage} />

        <Button variant="outline" onClick={handleDownload} disabled={progress !== null}>
          {t('finance.accountant_export.download')}
        </Button>
      </div>

      <div aria-live="polite" className="text-sm">
        {progress !== null && <p role="status">{t('finance.export.preparing', { count: progress })}</p>}
        {message && <p>{message}</p>}
        {error && <p className="alert-error">{error}</p>}
      </div>

      {/* [[ACCOUNTANT: confirm]] wording of this note (docs/plans/finance/ACCOUNTANT-VIEW.md). */}
      <p className="text-xs text-gray-600">{t('finance.accountant_export.note')}</p>
    </section>
  );
}
