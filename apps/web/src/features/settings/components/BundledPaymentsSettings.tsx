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

/** Bundled IL setup — generic shell with equal Grow / iCount / Invoice4U choice. */
export function BundledPaymentsSettings() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const activeSlug = getBundledPaymentProviderSlug(tenant);
  const [selected, setSelected] = useState<BundledPaymentProviderSlug>(
    activeSlug ?? BUNDLED_PAYMENT_PROVIDER_OPTIONS[0],
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

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">
          {t('settings.bundled.choose_provider', { defaultValue: 'Provider' })}
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BUNDLED_PAYMENT_PROVIDER_OPTIONS.map((slug) => {
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

      <BundledProviderForm slug={selected} />
    </div>
  );
}
