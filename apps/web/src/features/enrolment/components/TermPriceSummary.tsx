import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@shared/format';
import type { PayPlan, TermPriceView } from '../lib/checkoutBootstrapTypes';

/**
 * Term pricing (owner decision, 24 Nov 2026): the calculation written out for the family, and the
 * choice between monthly payments and the whole term up front. Discounts are already applied by
 * the server; this only shows them.
 */
export function TermPriceSummary({
  className,
  term,
  currency,
  onChoose,
  busy,
  payNowMinor,
  children,
}: {
  className: string;
  term: TermPriceView;
  currency: string;
  onChoose: (plan: PayPlan) => void;
  busy: boolean;
  /** What is paid now after a coupon or a client's own discount (default: the plan's first payment). */
  payNowMinor?: number;
  /** Coupon and client discount lines, shown above what is paid now. */
  children?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const money = (minor: number) => formatCurrency(minor, currency, i18n.language);
  const months = term.months.length;

  const plans: { plan: PayPlan; label: string; detail: string }[] = [
    {
      plan: 'monthly',
      label: t('enrolment.term_price.monthly', { count: months, amount: money(term.monthlyMinor) }),
      detail: t('enrolment.term_price.monthly_detail'),
    },
    {
      plan: 'upfront',
      label: t('enrolment.term_price.upfront', { amount: money(term.upfrontMinor) }),
      detail:
        term.upfrontPct > 0
          ? t('enrolment.term_price.upfront_detail', { pct: term.upfrontPct })
          : t('enrolment.term_price.upfront_detail_plain'),
    },
  ];

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-3" aria-label={t('enrolment.term_price.title')}>
      <p className="font-medium">{className}</p>
      <div className="space-y-1 text-sm">
        <p dir="auto">
          {t('enrolment.term_price.calculation', {
            count: term.classCount,
            perClass: money(term.perClassMinor),
            total: money(term.termTotalMinor),
          })}
        </p>
        {term.early && (
          <p className="text-gray-600">
            {t('enrolment.term_price.early', { price: money(term.perClassMinor), usual: money(term.listPerClassMinor) })}
          </p>
        )}
        {term.sisterPct > 0 && (
          <p className="text-gray-600">{t('enrolment.term_price.sister', { pct: term.sisterPct })}</p>
        )}
      </div>

      <fieldset className="space-y-2" disabled={busy}>
        <legend className="text-sm font-medium">{t('enrolment.term_price.choose')}</legend>
        {plans.map((p) => (
          <label
            key={p.plan}
            aria-label={p.label}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
              term.plan === p.plan ? 'border-primary bg-primary/5' : 'border-gray-200'
            }`}
          >
            <input
              type="radio"
              name="pay-plan"
              className="mt-1"
              checked={term.plan === p.plan}
              onChange={() => onChoose(p.plan)}
            />
            <span>
              <span className="block font-medium">{p.label}</span>
              <span className="block text-sm text-gray-600">{p.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {term.trialCreditMinor > 0 && (
        <p className="text-sm text-gray-600">
          {t('enrolment.term_price.trial', { amount: money(term.trialCreditMinor) })}
        </p>
      )}
      {children}
      <p className="font-medium">
        {t('enrolment.term_price.pay_now', { amount: money(payNowMinor ?? term.firstPaymentMinor[term.plan]) })}
      </p>
    </div>
  );
}
