import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProviderLimits } from '@/components/providers/ProviderLimits';
import { providerLimitKeys } from '@/lib/providerLimits';
import { HIDDEN_PAYMENT_PROVIDERS } from '@/lib/providerPairing';
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
 * Providers no longer offered (owner decision 2026-11-10): shown only to a studio that already
 * uses one, so its saved choice stays visible.
 */
export const OTHER_PAYMENT_PROVIDERS = HIDDEN_PAYMENT_PROVIDERS;

export function isOtherPaymentProvider(slug: string): boolean {
  return (OTHER_PAYMENT_PROVIDERS as readonly string[]).includes(slug);
}

/** Providers OpalSwift can't charge monthly fees through today (no saved cards in our integration). */
export const NO_MONTHLY_FEE_PAYMENT_PROVIDERS = ['ypay', 'invoice4u'] as const;

/**
 * Pure: the provider to keep when the "monthly fees?" answer changes. Invoice4U can't charge
 * monthly fees, so it falls back to the default, YPay. YPay stays shown
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
 * (owner decisions 2026-11-06 and 2026-11-10, docs/plans/PAYMENT-OPTIONS-DECISION.md):
 *  - By card online through the studio's own YPay account (the default), or "No card payments
 *    yet: I'll record payments myself". Takbull is listed first, greyed out as "Coming soon",
 *    until it launches. Nothing else is offered.
 *  - A studio already on Grow or Invoice4U still sees its saved choice.
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
  // A hidden provider is listed only when it is the studio's saved choice (decided once, so
  // picking YPay does not make it vanish before saving).
  const [savedHidden] = useState(isOtherPaymentProvider(provider) ? provider : null);

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
        {/* Takbull is shown but can't be picked until it launches (owner decision 2026-11-10). */}
        <label className={`${CHOICE_ROW} cursor-not-allowed text-gray-600`}>
          <input
            type="radio"
            className={CHOICE_RADIO}
            name={`${idPrefix}-payment`}
            value="takbull"
            checked={false}
            disabled
            aria-describedby={`${idPrefix}-payment-takbull-soon`}
            readOnly
          />
          <span>
            {t('payment_choice.takbull_label')}{' '}
            <span
              id={`${idPrefix}-payment-takbull-soon`}
              className="ms-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
            >
              {t('payment_choice.coming_soon')}
            </span>
          </span>
        </label>
        {radio('ypay')}
        {monthlyFees && provider === 'ypay' && (
          <p className="ms-11 pb-2 pe-3 text-xs text-muted-foreground" role="note">
            {t('payment_choice.ypay_monthly_note')}
          </p>
        )}
        {radio('offline')}
        {savedHidden && (
          <div id={`${idPrefix}-other-providers`} className="py-1">
            <div className={CHOICE_NESTED}>{radio(savedHidden)}</div>
          </div>
        )}
      </div>
      <p className={CHOICE_NOTE} role="note">
        {t('payment_choice.disclaimer')}
      </p>
    </fieldset>
  );
}
