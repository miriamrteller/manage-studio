import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AdminRoute } from '@/layouts/RouteGuards';
import { isPlatformAppHost } from '@/lib/resolveTenantSubdomain';
import {
  SMUGMUG_CALLBACK_PATH,
  SMUGMUG_SETTINGS_PATH,
  SmugMugActionError,
  SmugMugService,
  type SmugMugCallbackCode,
} from '@/features/settings/services/smugmugService';

/** One exchange per request token, shared across Strict Mode remounts (tokens are single-use). */
const inflight = new Map<string, Promise<void>>();

/**
 * Where SmugMug sends the photographer back after "Connect SmugMug": the fixed URL
 * https://app.opalswift.com/admin/setup/integrations/smugmug/callback (the same for every
 * studio). Finishes the sign-in, then returns to Settings → Payment.
 */
function SmugMugCallbackPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<SmugMugCallbackCode | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = params.get('oauth_token');
    const verifier = params.get('oauth_verifier');
    if (!token || !verifier) {
      setError('missing');
      return;
    }

    let exchange = inflight.get(token);
    if (!exchange) {
      exchange = SmugMugService.complete(token, verifier).finally(() => inflight.delete(token));
      inflight.set(token, exchange);
    }
    exchange
      .then(() => navigate(SMUGMUG_SETTINGS_PATH, { replace: true }))
      .catch((e) => setError(e instanceof SmugMugActionError && e.code === 'expired' ? 'expired' : 'refused'));
  }, [params, navigate]);

  return (
    <div className="mx-auto max-w-md space-y-3 p-8 text-center">
      <h1 className="text-xl font-semibold">{t('settings.smugmug.callback.title')}</h1>
      {error ? (
        <>
          <p className="text-sm text-error" role="alert">{t(`settings.smugmug.callback.${error}`)}</p>
          <Link className="text-sm font-medium underline" to={SMUGMUG_SETTINGS_PATH}>
            {t('settings.smugmug.callback.back')}
          </Link>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      )}
    </div>
  );
}

/**
 * The same page on the studio's own address, or null when we are already there.
 * Only the path and query (oauth_token + oauth_verifier) are carried over.
 */
export function smugmugStudioCallbackUrl(studioUrl: string, currentOrigin: string, search: string): string | null {
  let target: URL;
  try {
    target = new URL(studioUrl);
  } catch {
    return null;
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return null;
  if (target.origin === currentOrigin) return null;
  return `${target.origin}${SMUGMUG_CALLBACK_PATH}${search}`;
}

/**
 * SmugMug always returns to the one fixed callback on app.<root>. The studio admin is
 * signed in on the studio's own address, not there, so first ask the server which studio
 * the request token belongs to and carry on there with the same token and verifier.
 */
function ReturnToStudio() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get('oauth_token');
    if (!token || !params.get('oauth_verifier')) {
      setFailed(true);
      return;
    }
    SmugMugService.studioUrl(token)
      .then((url) => {
        const next = smugmugStudioCallbackUrl(url, window.location.origin, window.location.search);
        if (next) window.location.replace(next);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [params]);

  return (
    <div className="mx-auto max-w-md space-y-3 p-8 text-center">
      <h1 className="text-xl font-semibold">{t('settings.smugmug.callback.title')}</h1>
      {failed ? (
        <p className="text-sm text-error" role="alert">{t('settings.smugmug.callback.return_failed')}</p>
      ) : (
        <p className="text-sm text-muted-foreground" role="status">{t('settings.smugmug.callback.returning')}</p>
      )}
    </div>
  );
}

/** Route element: on app.<root> go back to the studio first; on a studio address finish here. */
export default function SmugMugCallbackRoute() {
  if (isPlatformAppHost()) return <ReturnToStudio />;
  return (
    <AdminRoute>
      <SmugMugCallbackPage />
    </AdminRoute>
  );
}
