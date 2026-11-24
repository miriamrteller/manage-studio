import { useTranslation } from 'react-i18next';
import type { QuoteTotals } from '@shared/index';
import { formatQuoteMoney } from '../lib/quoteFormat';
import type { QuoteDiscountPreview } from '../lib/quoteDiscount';

interface QuoteTotalsSummaryProps {
  totals: QuoteTotals;
  currency: string;
  depositPercent: number;
  /** The client's own discount (public quote page): shown as a line, deposit and balance after it. */
  discount?: QuoteDiscountPreview | null;
}

/** Gross totals; no VAT split (the tax document shows it — SPEC §2.5.1). */
export function QuoteTotalsSummary({ totals, currency, depositPercent, discount }: QuoteTotalsSummaryProps) {
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
      <dt className={discount ? undefined : 'font-semibold'}>{t('pages.quotes.totals.total')}</dt>
      <dd className={discount ? 'text-end' : 'text-end font-semibold'}>{money(totals.totalMinor)}</dd>
      {discount && (
        <>
          <dt className="text-muted-foreground">{t('pages.quotes.totals.your_discount')}</dt>
          <dd className="text-end">
            <span dir="ltr">−</span>
            {money(discount.discountMinor)}
          </dd>
          <dt className="font-semibold">{t('pages.quotes.totals.total_after_discount')}</dt>
          <dd className="text-end font-semibold">{money(discount.totalAfterMinor)}</dd>
        </>
      )}
      {depositPercent > 0 && (
        <>
          <dt className="text-muted-foreground">
            {t('pages.quotes.totals.deposit', { percent: depositPercent })}
          </dt>
          <dd className="text-end">{money(discount ? discount.depositAfterMinor : totals.depositMinor)}</dd>
          <dt className="text-muted-foreground">{t('pages.quotes.totals.balance')}</dt>
          <dd className="text-end">{money(discount ? discount.balanceAfterMinor : totals.balanceMinor)}</dd>
        </>
      )}
      <dd className="col-span-2 text-xs text-muted-foreground">{t('pages.quotes.totals.vat_note')}</dd>
    </dl>
  );
}
