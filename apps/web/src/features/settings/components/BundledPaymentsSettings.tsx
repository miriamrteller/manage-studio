import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import {
  BUNDLED_PAYMENT_PROVIDER_OPTIONS,
  bundledPaymentsHubDescription,
  bundledPaymentsNavTitle,
  bundledProviderDisplayName,
} from '@/lib/bundledProviderUi';
import {
  getBundledPaymentProviderSlug,
  type BundledPaymentProviderSlug,
} from '@/lib/tenantProviderRouting';
import { canChoosePaymentProvider, isUnfinishedPaymentProvider } from '@/lib/providerPairing';
import { useTenantHasPayment } from '../hooks/useTenantHasPayment';
import { GrowSettingsForm } from './GrowSettingsForm';
import { IcountSettingsForm } from './IcountSettingsForm';
import { Invoice4uSettingsForm } from './Invoice4uSettingsForm';

function BundledProviderForm({ slug }: { slug: BundledPaymentProviderSlug }) {
  switch (slug) {
    case 'grow':
      return <GrowSettingsForm embedded />;
    case 'icount':
      return <IcountSettingsForm embedded />;
    case 'invoice4u':
      return <Invoice4uSettingsForm embedded />;
    default: {
      const _exhaustive: never = slug;
      return _exhaustive;
    }
  }
}

/**
 * Pure: the providers this page offers. Before the studio's first payment it may pick any
 * finished one (switching freely); after it, a studio already on one keeps only that one
 * (changing it goes through support), a studio paying at the studio with no tax documents picks
 * among the finished ones, and any other studio cannot pick here. `hasPayment` unknown = yes.
 */
export function bundledProviderChoices(
  tenant: Parameters<typeof canChoosePaymentProvider>[0],
  hasPayment: boolean | undefined = true,
): BundledPaymentProviderSlug[] {
  const activeSlug = getBundledPaymentProviderSlug(tenant);
  const finished = BUNDLED_PAYMENT_PROVIDER_OPTIONS.filter((slug) => !isUnfinishedPaymentProvider(slug));
  if (!canChoosePaymentProvider(tenant, hasPayment)) return activeSlug ? [activeSlug] : [];
  if (activeSlug && hasPayment !== false) return [activeSlug];
  return activeSlug && !finished.includes(activeSlug) ? [activeSlug] : finished;
}

/** Bundled IL setup — generic shell with the Grow / Invoice4U choice. */
export function BundledPaymentsSettings() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const activeSlug = getBundledPaymentProviderSlug(tenant);
  const hasPayment = useTenantHasPayment((tenant as { id?: string } | null | undefined)?.id);
  const choices = bundledProviderChoices(tenant, hasPayment);
  const [selected, setSelected] = useState<BundledPaymentProviderSlug | undefined>(
    activeSlug ?? choices[0],
  );

  useEffect(() => {
    if (activeSlug) {
      setSelected(activeSlug);
    }
  }, [activeSlug]);

  return (
    <div className="space-y-8 max-w-lg">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{bundledPaymentsNavTitle(t)}</h1>
        <p className="text-gray-600">{bundledPaymentsHubDescription(t)}</p>
        <p className="text-sm text-muted-foreground">
          {t('settings.bundled.page_hint', {
            defaultValue:
              'Choose a provider below and enter credentials. Saving activates that integration for card payments and tax documents.',
          })}
        </p>
      </header>

      {!canChoosePaymentProvider(tenant, hasPayment) && (
        <p className="text-sm rounded-lg border border-border bg-muted/40 px-3 py-2" role="note">
          {t('settings.offline_payments.switch_contact_support')}
        </p>
      )}

      {choices.length > 1 && (
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">
          {t('settings.bundled.choose_provider', { defaultValue: 'Provider' })}
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {choices.map((slug) => {
            const inputId = `bundled-provider-${slug}`;
            const isActive = selected === slug;
            return (
              <label
                key={slug}
                htmlFor={inputId}
                className={`flex items-center gap-3 rounded border p-4 cursor-pointer transition-colors ${
                  isActive
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <input
                  id={inputId}
                  type="radio"
                  name="bundled-provider"
                  value={slug}
                  checked={isActive}
                  onChange={() => setSelected(slug)}
                  className="h-4 w-4"
                />
                <span className="font-medium">{bundledProviderDisplayName(slug)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      )}

      {choices.length > 1 && (
        <p className="text-sm text-muted-foreground">{t('payment_choice.disclaimer')}</p>
      )}

      {selected && choices.includes(selected) && <BundledProviderForm slug={selected} />}
    </div>
  );
}
