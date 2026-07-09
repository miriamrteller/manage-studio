import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GoogleCalendarService } from '@/features/scheduling/googleCalendarService';

/**
 * OAuth redirect target for Google Calendar. Exchanges the code via the callback
 * Edge Function, then returns the admin to booking settings.
 */
export default function GoogleCalendarCallbackPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

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

    GoogleCalendarService.complete(code, state)
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
