import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAuthSession } from '../hooks/useAuth';
import { useCurrentUser } from '../hooks/useCurrentUser';
import queryClient from '../lib/query-client';
import { resolveAuthErrorMessage } from '@/lib/authErrors';
import {
  captureAuthCallbackUrl,
  clearAuthCallbackUrl,
  establishSessionFromAuthCallback,
} from '@/lib/authCallback';

/**
 * AuthCallbackPage: Handles magic link callback after Supabase email auth
 */
export default function AuthCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const callbackUrlRef = useRef(captureAuthCallbackUrl());

  const { session, isLoading: sessionLoading } = useAuthSession();
  const { user, isLoading: isUserLoading, isProfileChecked } = useCurrentUser();

  useEffect(() => {
    let cancelled = false;

    const handleCallback = async () => {
      const result = await establishSessionFromAuthCallback(callbackUrlRef.current);

      if (cancelled) return;

      if (!result.ok) {
        const message =
          result.message === 'invalid_callback'
            ? t('errors.invalid_callback')
            : resolveAuthErrorMessage(result.message, t, 'errors.session_exchange_failed');
        setError(message);
        return;
      }

      clearAuthCallbackUrl();
      await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      setSessionReady(true);
    };

    void handleCallback();

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (!sessionReady || sessionLoading || isUserLoading || error) {
      return;
    }

    if (!session?.user) {
      return;
    }

    if (!isProfileChecked) {
      return;
    }

    if (!user) {
      setError(t('errors.user_not_found'));
      return;
    }

    if (user.role.length > 0) {
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/classes', { replace: true });
    }
  }, [
    user,
    session,
    sessionLoading,
    isUserLoading,
    isProfileChecked,
    error,
    navigate,
    sessionReady,
    t,
  ]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="w-full max-w-md">
          <div
            role="alert"
            className="bg-red-50 border-2 border-red-500 rounded-lg p-6 mb-6"
          >
            <h1 className="text-2xl font-bold text-red-600 mb-2">
              {t('errors.session_setup_failed')}
            </h1>
            <p className="text-red-700 mb-4">{error}</p>
          </div>

          <div className="space-y-4">
            <Button
              type="button"
              variant="primary"
              fullWidth
              onClick={() => {
                window.location.href = '/login';
              }}
            >
              {t('common.back_to_login')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => window.location.reload()}
            >
              {t('common.try_again')}
            </Button>
          </div>

          <p className="text-sm text-gray-600 text-center mt-6">
            {t('errors.contact_support')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-white"
      role="status"
      aria-busy="true"
      aria-label={t('auth.signing_you_in')}
    >
      <div className="text-center">
        <div className="mb-6">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-primary rounded-full animate-spin mx-auto" />
        </div>
        <h1 className="text-xl font-semibold text-gray-800 mb-2">
          {t('auth.signing_you_in')}
        </h1>
        <p className="text-gray-600">{t('auth.setting_up_access')}</p>
      </div>
    </div>
  );
}
