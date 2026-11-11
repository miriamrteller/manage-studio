import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AUTOMATIC_EMAIL_KEYS, reviewUrlSchema } from '../lib/quoteSchemas';
import { useAutomaticEmails, useReviewUrl } from '../hooks/useQuotes';

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
              <div className="flex-1">
                <label htmlFor={`automatic-email-${key}`} className="block text-sm font-medium">
                  {t(`pages.quotes.automatic.${key}`)}
                </label>
                <p id={`automatic-email-${key}-hint`} className="text-xs text-muted-foreground">
                  {t(`pages.quotes.automatic.${key}_hint`)}
                </p>
                {key === 'review_request' && settings.review_request && <ReviewUrlField />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The link the review request email opens. Optional: without it the email is not sent. */
function ReviewUrlField() {
  const { t } = useTranslation();
  const { reviewUrl, isLoading, save } = useReviewUrl();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setValue(reviewUrl ?? '');
  }, [reviewUrl]);

  if (isLoading) return null;
  const changed = value.trim() !== (reviewUrl ?? '');

  return (
    <form
      className="mt-2 space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!reviewUrlSchema.safeParse(value).success) {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        save.mutate(value);
      }}
    >
      <label htmlFor="automatic-email-review-url" className="block text-xs font-medium">
        {t('pages.quotes.automatic.review_url_label')}
      </label>
      <div className="flex gap-2">
        <input
          id="automatic-email-review-url"
          type="url"
          dir="ltr"
          inputMode="url"
          className="form-input flex-1"
          placeholder="https://"
          maxLength={500}
          value={value}
          aria-describedby="automatic-email-review-url-hint"
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
        />
        <Button type="submit" variant="secondary" size="sm" isLoading={save.isPending} disabled={!changed || save.isPending}>
          {t('common.save')}
        </Button>
      </div>
      <p id="automatic-email-review-url-hint" className="text-xs text-muted-foreground">
        {t('pages.quotes.automatic.review_url_hint')}
      </p>
      {invalid && <p className="text-xs text-destructive" role="alert">{t('pages.quotes.automatic.review_url_invalid')}</p>}
      {save.error instanceof Error && <p className="text-xs text-destructive" role="alert">{save.error.message}</p>}
      {save.isSuccess && !changed && <p className="text-xs" role="status">{t('common.saved')}</p>}
    </form>
  );
}
