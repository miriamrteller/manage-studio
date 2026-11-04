import { useTranslation } from 'react-i18next';
import { ProviderLimits } from '@/components/providers/ProviderLimits';
import { providerLimitKeys } from '@/lib/providerLimits';
import { CHOICE_GROUP, CHOICE_LEGEND, CHOICE_NOTE, CHOICE_RADIO, CHOICE_ROW } from './choiceStyles';

/** The providers a studio chooses between when setting up or before its first payment. */
export type ChoosablePaymentProvider = 'grow' | 'ypay' | 'invoice4u' | 'offline';

/** Card providers that can't charge monthly fees through OpalSwift. */
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

/** The options, in the order shown. */
export const PAYMENT_CHOICES: readonly ChoosablePaymentProvider[] = ['grow', 'ypay', 'invoice4u', 'offline'];

/**
 * How customers pay (owner decisions), used by the setup wizard and by Settings while the studio
 * may still choose. Every offered provider is listed, each with short lines on what it can't do
 * (lib/providerLimits.ts), and "No card payments yet: I'll record payments myself" (every
 * business, registered or not; card payments can be connected later). The question is about
 * CARD payments only. A studio charging monthly fees that picks YPay or Invoice4U gets a note;
 * nothing is blocked. Whether it charges monthly fees is not asked here: it follows the payment
 * flow. The caller pre-selects the provider. The disclaimer says when changing stops being free.
 */
export function PaymentProviderChoice({
  idPrefix,
  monthlyFees,
  provider,
  onProviderChange,
}: PaymentProviderChoiceProps) {
  const { t } = useTranslation();

  const radio = (slug: ChoosablePaymentProvider) => {
    const limitsId = `${idPrefix}-payment-${slug}-limits`;
    const hasLimits = providerLimitKeys('payment', slug).length > 0;
    return (
      <div key={slug} className="py-1">
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
        <ProviderLimits kind="payment" slug={slug} id={limitsId} className="ms-11 pb-1 pe-3" />
      </div>
    );
  };

  return (
    <fieldset>
      <legend className={CHOICE_LEGEND}>{t('studio_setup.payment_question')}</legend>
      <div className={CHOICE_GROUP}>
        {PAYMENT_CHOICES.map((slug) => radio(slug))}
      </div>
      {monthlyFees && isOtherPaymentProvider(provider) && (
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
