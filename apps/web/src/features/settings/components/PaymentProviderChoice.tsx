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

/**
 * Providers behind "Have a different provider?" (owner decision 2026-11-06): YPay and paying
 * at the studio are shown first; these stay available but are not offered up front.
 */
export const OTHER_PAYMENT_PROVIDERS = ['grow', 'invoice4u'] as const;

export function isOtherPaymentProvider(slug: string): boolean {
  return (OTHER_PAYMENT_PROVIDERS as readonly string[]).includes(slug);
}

/** Providers OpalSwift can't charge monthly fees through today (no saved cards in our integration). */
export const NO_MONTHLY_FEE_PAYMENT_PROVIDERS = ['ypay', 'invoice4u'] as const;

/**
 * Pure: the provider to keep when the "monthly fees?" answer changes. Invoice4U is not offered
 * to studios with monthly fees, so it falls back to the default, YPay. YPay stays shown
 * (owner decision 2026-11-06: to be tested with monthly fees before deciding).
 */
export function providerForMonthlyAnswer(
  monthlyFees: boolean,
  provider: ChoosablePaymentProvider,
): ChoosablePaymentProvider {
  return monthlyFees && provider === 'invoice4u' ? 'ypay' : provider;
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
 * How customers pay, used by the setup wizard and by Settings while the studio may still choose
 * (owner decision 2026-11-06, docs/plans/PAYMENT-OPTIONS-DECISION.md):
 *  - By card online through the studio's own YPay account (the default), or "No card payments
 *    yet: I'll record payments myself".
 *  - "Have a different provider?" reveals Grow, and Invoice4U for studios without monthly fees.
 * Whether the studio charges monthly fees is not asked here: it follows the payment flow. With
 * monthly fees, YPay shows a line that OpalSwift can't charge them through YPay yet.
 */
export function PaymentProviderChoice({
  idPrefix,
  monthlyFees,
  provider,
  onProviderChange,
}: PaymentProviderChoiceProps) {
  const { t } = useTranslation();
  const [showOthers, setShowOthers] = useState(isOtherPaymentProvider(provider));
  const othersVisible = showOthers || isOtherPaymentProvider(provider);
  // Invoice4U can't charge monthly fees, so it is not offered to studios that charge them.
  const otherProviders = OTHER_PAYMENT_PROVIDERS.filter((slug) => !monthlyFees || slug !== 'invoice4u');

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
        {radio('ypay')}
        {monthlyFees && provider === 'ypay' && (
          <p className="ms-11 pb-2 pe-3 text-xs text-muted-foreground" role="note">
            {t('payment_choice.ypay_monthly_note')}
          </p>
        )}
        {radio('offline')}
        {!othersVisible && (
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
            <div className={CHOICE_NESTED}>{otherProviders.map((slug) => radio(slug))}</div>
          </div>
        )}
      </div>
      <p className={CHOICE_NOTE} role="note">
        {t('payment_choice.disclaimer')}
      </p>
    </fieldset>
  );
}
