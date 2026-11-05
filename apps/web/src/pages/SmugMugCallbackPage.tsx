import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
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
export default function SmugMugCallbackPage() {
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
