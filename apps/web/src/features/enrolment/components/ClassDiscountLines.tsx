import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@shared/format';
import type { ClassDiscountLine } from '../lib/checkoutBootstrapTypes';

/**
 * The class price and each class discount (sibling, extra class, early bird, the
 * client's own discount, a coupon) as its own line, above the total. Shows nothing
 * when there is no discount. A first-payment coupon is marked as such, and for a
 * monthly class the parent sees what later months cost.
 */
export function ClassDiscountLines({
  listAmountMinor,
  discounts,
  currency,
  monthly = false,
  priceLabelKey = 'class_discounts.class_price',
}: {
  listAmountMinor: number | null | undefined;
  discounts: ClassDiscountLine[] | null | undefined;
  currency: string;
  /** The discount is per month (monthly classes). */
  monthly?: boolean;
  /** The first line's label: "Class price" by default, "Price" for other sales. */
  priceLabelKey?: string;
}) {
  const { t, i18n } = useTranslation();
  if (!discounts || discounts.length === 0 || listAmountMinor == null) return null;
  const money = (minor: number) => formatCurrency(minor, currency, i18n.language);
  const hasFirstOnly = discounts.some((line) => line.firstOnly);
  const everyMonthMinor = Math.max(
    0,
    listAmountMinor - discounts.filter((line) => !line.firstOnly).reduce((sum, line) => sum + line.amountMinor, 0),
  );
  const label = (line: ClassDiscountLine) => {
    const base =
      line.kind === 'coupon' && line.code
        ? t('class_discounts.line_coupon_code', { code: line.code })
        : t(`class_discounts.line_${line.kind}`);
    return line.firstOnly ? t('class_discounts.first_payment_only', { label: base }) : base;
  };
  return (
    <div className="space-y-0.5" data-testid="class-discount-lines">
      <dl className="space-y-0.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt>{t(priceLabelKey)}</dt>
          <dd>{money(listAmountMinor)}</dd>
        </div>
        {discounts.map((line) => (
          <div key={`${line.kind}-${line.code ?? ''}`} className="flex justify-between gap-4 text-green-800">
            <dt>{label(line)}</dt>
            {/* A minus sign before the amount reads correctly in both directions. */}
            <dd dir="ltr">−{money(line.amountMinor)}</dd>
          </div>
        ))}
      </dl>
      {monthly && hasFirstOnly && (
        <p className="text-xs text-muted-foreground">
          {t('class_discounts.then_every_month', { amount: money(everyMonthMinor) })}
        </p>
      )}
      {monthly && !hasFirstOnly && (
        <p className="text-xs text-muted-foreground">{t('class_discounts.every_month')}</p>
      )}
    </div>
  );
}

type DiscountLineRow = {
  kind: ClassDiscountLine['kind'];
  amount_minor: number;
  first_only?: boolean;
  code?: string;
};

/** Pure: snake_case lines from an engagement row, for the component above. */
export function discountLinesFromRow(raw: DiscountLineRow[] | null | undefined): ClassDiscountLine[] {
  return (raw ?? []).map((line) => ({
    kind: line.kind,
    amountMinor: line.amount_minor,
    ...(line.first_only ? { firstOnly: true } : {}),
    ...(line.code ? { code: line.code } : {}),
  }));
}
