import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@shared/format';
import type { ClassDiscountLine } from '../lib/checkoutBootstrapTypes';

/**
 * The class price and each automatic class discount (sibling, extra class, early bird)
 * as its own line, above the total. Shows nothing when there is no discount.
 */
export function ClassDiscountLines({
  listAmountMinor,
  discounts,
  currency,
  monthly = false,
}: {
  listAmountMinor: number | null | undefined;
  discounts: ClassDiscountLine[] | null | undefined;
  currency: string;
  /** The discount is per month (monthly classes). */
  monthly?: boolean;
}) {
  const { t, i18n } = useTranslation();
  if (!discounts || discounts.length === 0 || listAmountMinor == null) return null;
  const money = (minor: number) => formatCurrency(minor, currency, i18n.language);
  return (
    <div className="space-y-0.5" data-testid="class-discount-lines">
      <dl className="space-y-0.5 text-sm">
      <div className="flex justify-between gap-4">
        <dt>{t('class_discounts.class_price')}</dt>
        <dd>{money(listAmountMinor)}</dd>
      </div>
      {discounts.map((line) => (
        <div key={line.kind} className="flex justify-between gap-4 text-green-800">
          <dt>{t(`class_discounts.line_${line.kind}`)}</dt>
          {/* A minus sign before the amount reads correctly in both directions. */}
          <dd dir="ltr">−{money(line.amountMinor)}</dd>
        </div>
      ))}
      </dl>
      {monthly && <p className="text-xs text-muted-foreground">{t('class_discounts.every_month')}</p>}
    </div>
  );
}

/** Pure: snake_case lines from an engagement row, for the component above. */
export function discountLinesFromRow(
  raw: Array<{ kind: ClassDiscountLine['kind']; amount_minor: number }> | null | undefined,
): ClassDiscountLine[] {
  return (raw ?? []).map((line) => ({ kind: line.kind, amountMinor: line.amount_minor }));
}
