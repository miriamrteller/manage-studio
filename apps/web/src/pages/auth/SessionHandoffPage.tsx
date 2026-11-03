import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  establishSessionFromAuthCallback,
  captureAuthCallbackUrl,
  clearAuthCallbackUrl,
} from '@/lib/authCallback';

/**
 * /auth/session-handoff: a studio's own address takes over the session that
 * app.<root> handed it in the URL fragment ("Go to your studio", the studio
 * cards on the welcome page), then opens the right home for the role.
 */
export default function SessionHandoffPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Capture URL parts before anything can strip them
      const url = captureAuthCallbackUrl();
      const result = await establishSessionFromAuthCallback(url);

      if (cancelled) return;

      if (result.ok) {
        clearAuthCallbackUrl();
        navigate('/dashboard', { replace: true });
      } else {
        // The tokens may be in the address: never keep them around.
        clearAuthCallbackUrl();
        setFailed(true);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [navigate]);

  if (failed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full rounded-md bg-red-50 p-6 text-center" role="alert">
          <p className="text-sm font-medium text-red-800">{t('auth.handoff_failed')}</p>
          <a href="/login" className="mt-4 inline-block text-sm text-indigo-700 underline">
            {t('auth.handoff_sign_in')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" role="status" aria-live="polite">
      <p className="text-sm text-gray-700">{t('auth.handoff_opening')}</p>
    </div>
  );
}
