import { useTranslation } from 'react-i18next';
import { TwoFactorSettings } from '@/components/legal/TwoFactorSettings';
import { DataExportButton } from '@/components/legal/DataExportButton';

/** Settings → Security: two-step sign-in for this admin, and the studio data export. */
export function SecuritySettingsForm() {
  const { t } = useTranslation();
  return (
    <section className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('legal.security.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('legal.security.description')}</p>
      </div>
      <TwoFactorSettings />
      <DataExportButton />
    </section>
  );
}
