import { useTranslation } from 'react-i18next';

/**
 * The studio's country, shown as text: OpalSwift is for studios in Israel only
 * (payments, tax documents and legal templates are Israeli), so it is not a choice.
 */
export function StudioCountry({ idPrefix }: { idPrefix: string }) {
  const { t } = useTranslation();
  const labelId = `${idPrefix}-label`;
  return (
    <div className="space-y-1">
      <p className="block text-sm font-medium" id={labelId}>
        {t('studio_setup.country')}
      </p>
      <p role="group" aria-labelledby={labelId}>
        {t('studio_setup.country_il')}
      </p>
    </div>
  );
}
