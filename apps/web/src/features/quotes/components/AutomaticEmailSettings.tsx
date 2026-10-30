import { useTranslation } from 'react-i18next';
import { AUTOMATIC_EMAIL_KEYS } from '../lib/quoteSchemas';
import { useAutomaticEmails } from '../hooks/useQuotes';

/** Per-tenant on/off switches for the fixed set of automatic emails. */
export function AutomaticEmailSettings() {
  const { t } = useTranslation();
  const { settings, isLoading, error, toggle } = useAutomaticEmails();

  return (
    <section aria-labelledby="automatic-emails-heading" className="card p-4 space-y-3">
      <h2 id="automatic-emails-heading" className="font-semibold">{t('pages.quotes.automatic.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('pages.quotes.automatic.description')}</p>
      {isLoading && <p role="status">{t('common.loading')}</p>}
      {error instanceof Error && <div className="alert-error" role="alert">{error.message}</div>}
      {settings && (
        <ul className="space-y-2">
          {AUTOMATIC_EMAIL_KEYS.map((key) => (
            <li key={key} className="flex items-start gap-3">
              <input
                id={`automatic-email-${key}`}
                type="checkbox"
                role="switch"
                className="mt-1"
                aria-describedby={`automatic-email-${key}-hint`}
                checked={settings[key]}
                disabled={toggle.isPending}
                onChange={(e) => toggle.mutate({ key, enabled: e.target.checked })}
              />
              <div>
                <label htmlFor={`automatic-email-${key}`} className="block text-sm font-medium">
                  {t(`pages.quotes.automatic.${key}`)}
                </label>
                <p id={`automatic-email-${key}-hint`} className="text-xs text-muted-foreground">
                  {t(`pages.quotes.automatic.${key}_hint`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
