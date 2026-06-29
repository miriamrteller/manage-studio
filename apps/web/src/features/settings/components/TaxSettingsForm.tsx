import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { getBundledPaymentProviderSlug } from '@/lib/tenantProviderRouting';
import { bundledTaxVatMessage } from '@/lib/bundledProviderUi';

export function TaxSettingsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const bundledSlug = getBundledPaymentProviderSlug(tenant);

  if (!tenant) {
    return null;
  }

  return (
    <section className="space-y-4 max-w-lg">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{t('settings.tax.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.tax.description')}</p>
      </header>

      <div className="rounded border border-border bg-muted/30 p-4 space-y-3 text-sm">
        <p>{t('settings.tax.no_local_vat')}</p>
        {bundledSlug ? (
          <p>{bundledTaxVatMessage(t, bundledSlug)}</p>
        ) : (
          <p>{t('settings.tax.invoicing_handles_vat')}</p>
        )}
        <p className="font-medium">{t('settings.tax.class_price_hint')}</p>
        <p className="text-xs text-muted-foreground">{t('settings.tax.not_tax_advice')}</p>
      </div>
    </section>
  );
}
