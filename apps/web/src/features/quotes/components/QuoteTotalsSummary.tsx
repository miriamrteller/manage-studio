import { useTranslation } from 'react-i18next';
import type { QuoteTotals } from '@shared/index';
import { formatQuoteMoney } from '../lib/quoteFormat';

interface QuoteTotalsSummaryProps {
  totals: QuoteTotals;
  currency: string;
  depositPercent: number;
}

/** Gross totals; no VAT split (the tax document shows it — SPEC §2.5.1). */
export function QuoteTotalsSummary({ totals, currency, depositPercent }: QuoteTotalsSummaryProps) {
  const { t, i18n } = useTranslation();
  const money = (minor: number) => <bdi>{formatQuoteMoney(minor, currency, i18n.language)}</bdi>;
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm" aria-live="polite">
      {totals.optionalSelectedMinor > 0 && (
        <>
          <dt className="text-muted-foreground">{t('pages.quotes.totals.required')}</dt>
          <dd className="text-end">{money(totals.requiredMinor)}</dd>
          <dt className="text-muted-foreground">{t('pages.quotes.totals.addons')}</dt>
          <dd className="text-end">{money(totals.optionalSelectedMinor)}</dd>
        </>
      )}
      <dt className="font-semibold">{t('pages.quotes.totals.total')}</dt>
      <dd className="text-end font-semibold">{money(totals.totalMinor)}</dd>
      {depositPercent > 0 && (
        <>
          <dt className="text-muted-foreground">
            {t('pages.quotes.totals.deposit', { percent: depositPercent })}
          </dt>
          <dd className="text-end">{money(totals.depositMinor)}</dd>
          <dt className="text-muted-foreground">{t('pages.quotes.totals.balance')}</dt>
          <dd className="text-end">{money(totals.balanceMinor)}</dd>
        </>
      )}
      <dd className="col-span-2 text-xs text-muted-foreground">{t('pages.quotes.totals.vat_note')}</dd>
    </dl>
  );
}
