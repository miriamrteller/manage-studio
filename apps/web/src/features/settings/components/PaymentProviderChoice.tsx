import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProviderLimits } from '@/components/providers/ProviderLimits';
import { providerLimitKeys } from '@/lib/providerLimits';
import {
  CHOICE_GROUP,
  CHOICE_LEGEND,
  CHOICE_NESTED,
  CHOICE_NOTE,
  CHOICE_RADIO,
  CHOICE_ROW,
} from './choiceStyles';

/** The providers a studio chooses between when setting up or before its first payment. */
export type ChoosablePaymentProvider = 'grow' | 'ypay' | 'invoice4u' | 'offline';

/** Card providers behind "Different provider?": no monthly fees with these. */
export const OTHER_PAYMENT_PROVIDERS = ['ypay', 'invoice4u'] as const;

export function isOtherPaymentProvider(slug: string): boolean {
  return (OTHER_PAYMENT_PROVIDERS as readonly string[]).includes(slug);
}

/**
 * Pure: the provider to keep when the "monthly fees?" answer changes. Monthly fees need Grow
 * or pay at the studio, so YPay / Invoice4U fall back to Grow on Yes.
 */
export function providerForMonthlyAnswer(
  monthlyFees: boolean,
  provider: ChoosablePaymentProvider,
): ChoosablePaymentProvider {
  return monthlyFees && isOtherPaymentProvider(provider) ? 'grow' : provider;
}

interface PaymentProviderChoiceProps {
  /** Keeps ids unique when the choice appears twice on a page. */
  idPrefix: string;
  /** Whether the studio charges monthly fees. Not asked: derived from the payment flow. */
  monthlyFees: boolean;
  provider: ChoosablePaymentProvider;
  onProviderChange: (provider: ChoosablePaymentProvider) => void;
}

/**
 * How customers pay (owner decisions), used by the setup wizard and by Settings while the studio
 * may still choose:
 *  - Grow, or "No card payments yet: I'll record payments myself" (every business, registered or not;
 *    card payments can be connected later). The question is about CARD payments only.
 *  - Studios that do not charge monthly fees also get "Different provider?" revealing YPay and
 *    Invoice4U, with a warning that they cannot charge monthly fees.
 * Whether the studio charges monthly fees is not asked here: it follows the payment flow (monthly
 * or both = yes). Grow is pre-selected by the caller. The disclaimer says when changing stops
 * being free. Each option shows short, confirmed lines on what OpalSwift can't do with it
 * (lib/providerLimits.ts).
 */
export function PaymentProviderChoice({
  idPrefix,
  monthlyFees,
  provider,
  onProviderChange,
}: PaymentProviderChoiceProps) {
  const { t } = useTranslation();
  const [showOthers, setShowOthers] = useState(isOtherPaymentProvider(provider));
  const othersVisible = !monthlyFees && (showOthers || isOtherPaymentProvider(provider));

  const radio = (slug: ChoosablePaymentProvider) => {
    const limitsId = `${idPrefix}-payment-${slug}-limits`;
    const hasLimits = providerLimitKeys('payment', slug).length > 0;
    return (
      <div key={slug}>
        <label className={CHOICE_ROW}>
          <input
            type="radio"
            className={CHOICE_RADIO}
            name={`${idPrefix}-payment`}
            value={slug}
            checked={provider === slug}
            aria-describedby={hasLimits ? limitsId : undefined}
            onChange={() => onProviderChange(slug)}
          />
          <span>{t(`studio_setup.payment_${slug}`)}</span>
        </label>
        <ProviderLimits kind="payment" slug={slug} id={limitsId} className="ms-11 pb-2 pe-3" />
      </div>
    );
  };

  return (
    <fieldset>
      <legend className={CHOICE_LEGEND}>{t('studio_setup.payment_question')}</legend>
      <div className={CHOICE_GROUP}>
        {radio('grow')}
        {!monthlyFees && !othersVisible && (
          <div className="px-3 py-2">
            <button
              type="button"
              className="ms-8 text-sm font-medium text-primary underline underline-offset-2"
              onClick={() => setShowOthers(true)}
            >
              {t('payment_choice.different_provider')}
            </button>
          </div>
        )}
        {othersVisible && (
          <div id={`${idPrefix}-other-providers`} className="py-1">
            <div className={CHOICE_NESTED}>{OTHER_PAYMENT_PROVIDERS.map((slug) => radio(slug))}</div>
          </div>
        )}
        {radio('offline')}
      </div>
      {!monthlyFees && isOtherPaymentProvider(provider) && (
        <p className={CHOICE_NOTE} role="note">
          {t('payment_choice.no_monthly_warning', {
            provider: t(`settings.offline_payments.providers.${provider}`),
          })}
        </p>
      )}
      <p className={CHOICE_NOTE} role="note">
        {t('payment_choice.disclaimer')}
      </p>
    </fieldset>
  );
}
