import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { reportError } from '@/lib/monitoring';
import { useReportProblem } from '@/components/ReportProblem';

/**
 * Route-level error boundary UI (react-router errorElement). Mounted on a
 * pathless route inside RootLayout, so a page that throws during render only
 * replaces the page's outlet — the header and nav drawer stay usable.
 */
export function RouteErrorFallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const error = useRouteError();
  const { canReport, openReportProblem } = useReportProblem();

  useEffect(() => {
    console.error('Route error boundary caught:', error);
    // 404s and other router responses are expected; only real crashes are reported.
    if (!isRouteErrorResponse(error)) reportError(error, { boundary: 'route' });
  }, [error]);

  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);

  return (
    <div className="mx-auto max-w-xl space-y-4 p-6" role="alert">
      <h1 className="text-3xl font-bold">{t('errors.page_crashed_title')}</h1>
      <p className="text-gray-600">{t('errors.page_crashed_description')}</p>
      {detail && (
        <details className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          <summary className="cursor-pointer font-medium">
            {t('errors.page_crashed_details')}
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{detail}</pre>
        </details>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => navigate(-1)}>
          {t('common.back')}
        </Button>
        <Button onClick={() => navigate('/')}>{t('common.home')}</Button>
        {canReport && (
          <Button variant="ghost" onClick={openReportProblem}>
            {t('report_problem.from_error')}
          </Button>
        )}
      </div>
    </div>
  );
}
