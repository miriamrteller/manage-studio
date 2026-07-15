import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GoogleCalendarService } from '@/features/scheduling/googleCalendarService';

const STORAGE_PREFIX = 'gcal-oauth-done:';

/** In-flight exchanges keyed by code — shared across Strict Mode remounts. */
const inflightByCode = new Map<string, Promise<void>>();

/**
 * OAuth redirect target for Google Calendar. Exchanges the code via the callback
 * Edge Function, then returns the admin to booking settings.
 */
export default function GoogleCalendarCallbackPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthError = searchParams.get('error');

    if (oauthError) {
      setError(oauthError);
      return;
    }
    if (!code || !state) {
      setError('Missing code or state');
      return;
    }

    // OAuth codes are single-use. React Strict Mode remounts must share one exchange.
    const successKey = `${STORAGE_PREFIX}${code}`;
    if (sessionStorage.getItem(successKey) === 'ok') {
      navigate('/admin/setup/booking', { replace: true });
      return;
    }

    let exchange = inflightByCode.get(code);
    if (!exchange) {
      exchange = GoogleCalendarService.complete(code, state)
        .then(() => {
          sessionStorage.setItem(successKey, 'ok');
        })
        .finally(() => {
          inflightByCode.delete(code);
        });
      inflightByCode.set(code, exchange);
    }

    exchange
      .then(() => navigate('/admin/setup/booking', { replace: true }))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [searchParams, navigate]);

  return (
    <div className="mx-auto max-w-md space-y-3 p-8 text-center">
      <h1 className="text-xl font-semibold">{t('scheduling.integrations.google_title')}</h1>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      )}
    </div>
  );
}
