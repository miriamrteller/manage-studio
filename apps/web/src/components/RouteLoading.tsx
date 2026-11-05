import { useTranslation } from 'react-i18next';

/** Shown for the moment a page's code is downloading (pages load on demand). */
export function RouteLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <span
        className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-primary"
        aria-hidden="true"
      />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}
