import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  monthlyFees: boolean | null;
  onMonthlyFeesChange: (monthlyFees: boolean) => void;
  provider: ChoosablePaymentProvider;
  onProviderChange: (provider: ChoosablePaymentProvider) => void;
}

/**
 * "Will you charge monthly fees?" then how customers pay (owner decision, payments follow-up 4),
 * used by the setup wizard and by Settings while the studio may still choose:
 *  - Yes: Grow, or "Not a registered business yet: pay at the studio".
 *  - No: the same, plus "Different provider?" revealing YPay and Invoice4U, with a warning that
 *    they cannot charge monthly fees.
 * Unanswered: Grow and pay at the studio are shown; the caller requires an answer before moving
 * on or switching. Grow is pre-selected by the caller. The disclaimer says when changing stops
 * being free.
 */
export function PaymentProviderChoice({
  idPrefix,
  monthlyFees,
  onMonthlyFeesChange,
  provider,
  onProviderChange,
}: PaymentProviderChoiceProps) {
  const { t } = useTranslation();
  const [showOthers, setShowOthers] = useState(isOtherPaymentProvider(provider));
  const othersVisible = monthlyFees === false && (showOthers || isOtherPaymentProvider(provider));

  const radio = (slug: ChoosablePaymentProvider) => (
    <label key={slug} className={CHOICE_ROW}>
      <input
        type="radio"
        className={CHOICE_RADIO}
        name={`${idPrefix}-payment`}
        value={slug}
        checked={provider === slug}
        onChange={() => onProviderChange(slug)}
      />
      <span>{t(`studio_setup.payment_${slug}`)}</span>
    </label>
  );

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className={CHOICE_LEGEND}>{t('payment_choice.monthly_question')}</legend>
        <div className={CHOICE_GROUP}>
          {([true, false] as const).map((answer) => (
            <label key={String(answer)} className={CHOICE_ROW}>
              <input
                type="radio"
                className={CHOICE_RADIO}
                name={`${idPrefix}-monthly`}
                value={answer ? 'yes' : 'no'}
                checked={monthlyFees === answer}
                onChange={() => {
                  onMonthlyFeesChange(answer);
                  const next = providerForMonthlyAnswer(answer, provider);
                  if (next !== provider) onProviderChange(next);
                }}
              />
              <span>{t(answer ? 'payment_choice.monthly_yes' : 'payment_choice.monthly_no')}</span>
            </label>
          ))}
        </div>
        {monthlyFees === null && <p className={CHOICE_NOTE}>{t('payment_choice.monthly_answer_first')}</p>}
      </fieldset>

      <fieldset>
        <legend className={CHOICE_LEGEND}>{t('studio_setup.payment_question')}</legend>
        <div className={CHOICE_GROUP}>
          {radio('grow')}
          {monthlyFees === false && !othersVisible && (
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
        {monthlyFees === false && isOtherPaymentProvider(provider) && (
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
    </div>
  );
}
