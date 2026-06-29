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

      <div className="rounded border border-border bg-muted/30 p-4 space-y-5 text-sm">
        <div>
          <h3 className="font-medium text-foreground">{t('settings.tax.what_we_do_title')}</h3>
          <ul className="mt-2 list-disc ps-5 space-y-1 text-muted-foreground">
            <li>{t('settings.tax.what_we_do_charge')}</li>
            <li>{t('settings.tax.what_we_do_store')}</li>
            <li>{t('settings.tax.what_we_do_display')}</li>
          </ul>
        </div>

        <div>
          <h3 className="font-medium text-foreground">{t('settings.tax.what_we_dont_title')}</h3>
          <ul className="mt-2 list-disc ps-5 space-y-1 text-muted-foreground">
            <li>{t('settings.tax.what_we_dont_calculate')}</li>
            <li>{t('settings.tax.what_we_dont_incl_excl')}</li>
            <li>{t('settings.tax.what_we_dont_documents')}</li>
            <li>{t('settings.tax.what_we_dont_status')}</li>
          </ul>
        </div>

        <p className="text-muted-foreground">
          {bundledSlug ? bundledTaxVatMessage(t, bundledSlug) : t('settings.tax.invoicing_handles_vat')}
        </p>

        <p className="font-medium text-foreground">{t('settings.tax.class_price_rule')}</p>
        <p className="text-xs text-muted-foreground">{t('settings.tax.not_tax_advice')}</p>
      </div>
    </section>
  );
}
