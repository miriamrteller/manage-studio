import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SchoolProfileForm } from './SchoolProfileForm';
import { BrandingSettingsForm } from './BrandingSettingsForm';
import { LocaleSettingsForm } from './LocaleSettingsForm';

function SettingsLinkCard({
  title,
  description,
  href,
  disabled,
  disabledHint,
}: {
  title: string;
  description: string;
  href: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="card border border-gray-200 space-y-3 p-4">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
      {disabled && disabledHint && (
        <p className="text-xs text-muted-foreground">{disabledHint}</p>
      )}
      <Button
        variant="primary"
        disabled={disabled}
        onClick={() => navigate(href)}
        aria-label={title}
      >
        {t('common.manage')} →
      </Button>
    </div>
  );
}

export function TenantSettingsHub() {
  const { t } = useTranslation();

  return (
    <div className="space-y-10 max-w-3xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('settings.hub.page_title')}</h1>
        <p className="text-gray-600">{t('settings.hub.page_description')}</p>
      </header>

      <SchoolProfileForm />
      <hr className="border-gray-200" />
      <BrandingSettingsForm />
      <hr className="border-gray-200" />
      <LocaleSettingsForm />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t('settings.hub.more_settings')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SettingsLinkCard
            title={t('settings.tax.title')}
            description={t('settings.tax.description')}
            href="/admin/setup/tax"
          />
          <SettingsLinkCard
            title={t('settings.stripe.title')}
            description={t('settings.stripe.description')}
            href="/admin/setup/stripe"
          />
          <SettingsLinkCard
            title={t('settings.hub.compliance_title')}
            description={t('settings.hub.compliance_description')}
            href="/admin/setup/waivers"
            disabled
            disabledHint={t('settings.hub.coming_soon')}
          />
        </div>
      </section>
    </div>
  );
}
