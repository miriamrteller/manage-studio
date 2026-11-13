import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GoogleCalendarService } from '@/features/scheduling/googleCalendarService';
import { AdminRoute } from '@/layouts/RouteGuards';
import { isPlatformAppHost } from '@/lib/resolveTenantSubdomain';

const STORAGE_PREFIX = 'gcal-oauth-done:';

/** In-flight exchanges keyed by code — shared across Strict Mode remounts. */
const inflightByCode = new Map<string, Promise<void>>();

/**
 * OAuth redirect target for Google Calendar. Exchanges the code via the callback
 * Edge Function, then returns the admin to booking settings.
 */
function GoogleCalendarCallbackPage() {
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
      navigate('/admin/appointments', { replace: true });
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
      .then(() => navigate('/admin/appointments', { replace: true }))
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

/**
 * The same page on the studio's own address, or null when we are already there.
 * Only the path and query (code + state) are carried over.
 */
export function studioCallbackUrl(studioUrl: string, currentOrigin: string, search: string): string | null {
  let target: URL;
  try {
    target = new URL(studioUrl);
  } catch {
    return null;
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return null;
  if (target.origin === currentOrigin) return null;
  return `${target.origin}${CALLBACK_PATH}${search}`;
}

const CALLBACK_PATH = '/admin/setup/integrations/google/callback';

/**
 * Google always returns to the one address registered with it, on app.<root>. The studio
 * admin is signed in on the studio's own address, not there, so first ask the server which
 * studio the signed state belongs to and carry on there with the same code and state.
 */
function ReturnToStudio() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const state = searchParams.get('state');
    if (!state) {
      setFailed(true);
      return;
    }
    GoogleCalendarService.studioUrl(state)
      .then((url) => {
        const next = studioCallbackUrl(url, window.location.origin, window.location.search);
        if (next) window.location.replace(next);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [searchParams]);

  return (
    <div className="mx-auto max-w-md space-y-3 p-8 text-center">
      <h1 className="text-xl font-semibold">{t('scheduling.integrations.google_title')}</h1>
      {failed ? (
        <p className="text-sm text-red-700" role="alert">
          {t('scheduling.integrations.return_failed')}
        </p>
      ) : (
        <p className="text-sm text-gray-500" role="status">
          {t('scheduling.integrations.returning')}
        </p>
      )}
    </div>
  );
}

/** Route element: on app.<root> go back to the studio first; on a studio address finish here. */
export default function GoogleCalendarCallbackRoute() {
  if (isPlatformAppHost()) return <ReturnToStudio />;
  return (
    <AdminRoute>
      <GoogleCalendarCallbackPage />
    </AdminRoute>
  );
}
