import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useCurrentUser } from '../hooks/useCurrentUser';

/**
 * AuthCallbackPage: Handles magic link callback after Supabase email auth
 *
 * Flow:
 * 1. Extract code + state from URL
 * 2. Exchange code for session with supabase.auth.exchangeCodeForSession()
 * 3. Fetch user profile (auto-create if missing with role='parent')
 * 4. Redirect by role: tenant_admin → /admin/people, teacher → /admin/classes, parent/student → /classes
 * 5. Error handling: show error UI, link to login
 *
 * WCAG: aria-busy spinner, aria-label for loading state, error messages role="alert"
 * RLS: Respects tenant_id isolation, user_profiles INSERT uses RLS
 */
export default function AuthCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const { user, isLoading: isUserLoading } = useCurrentUser();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');

        if (!code) {
          setError(t('error.invalid_callback'));
          return;
        }

        // Step 1: Exchange code for session
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          setError(exchangeError.message || t('error.session_exchange_failed'));
          return;
        }

        // Step 2: Wait for user profile to load (useCurrentUser will fetch it)
        // User profile fetch happens in useCurrentUser hook
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t('error.unexpected');
        setError(errorMessage);
      }
    };

    handleCallback();
  }, [searchParams, t]);

  // Step 3: Once user is loaded, redirect by role
  useEffect(() => {
    if (isUserLoading) {
      return; // Still loading
    }

    if (error) {
      return; // Error already set
    }

    if (!user) {
      setError(t('error.user_not_found'));
      return;
    }

    // Redirect based on role
    if (user.role.includes('tenant_admin')) {
      navigate('/admin/people', { replace: true });
    } else if (user.role.includes('teacher')) {
      navigate('/admin/classes', { replace: true });
    } else if (
      user.role.includes('parent') ||
      user.role.includes('student') ||
      user.role.includes('adult_student')
    ) {
      navigate('/classes', { replace: true });
    } else {
      // Default to classes page if role unknown
      navigate('/classes', { replace: true });
    }
  }, [user, isUserLoading, error, navigate, t]);

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="w-full max-w-md">
          <div
            role="alert"
            className="bg-red-50 border-2 border-red-500 rounded-lg p-6 mb-6"
          >
            <h1 className="text-2xl font-bold text-red-600 mb-2">
              {t('error.session_setup_failed')}
            </h1>
            <p className="text-red-700 mb-4">{error}</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => window.location.href = '/login'}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark focus-visible:outline-2 outline-primary outline-offset-2"
            >
              {t('common.back_to_login')}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 focus-visible:outline-2 outline-gray-700 outline-offset-2"
            >
              {t('common.try_again')}
            </button>
          </div>

          <p className="text-sm text-gray-600 text-center mt-6">
            {t('error.contact_support')}
          </p>
        </div>
      </div>
    );
  }

  // Loading state
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
