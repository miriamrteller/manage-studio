import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LoginForm } from '@/components/shared';
import { useLogin } from '@/hooks/useLogin';
import { persistEnrollmentIntent } from '@/lib/enrollment-intent';

/**
 * LoginPage: Light composition page
 * - Acts as a route container, not a logic container
 * - Composes PublicLayout + LoginForm component
 * - Delegates form logic to useLogin hook
 * - Extracts intended destination from location state
 * - WCAG: Semantic structure maintained in child components
 */

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Preserve enrollment intent (classId) through login → dashboard redirect chain
  const postLoginState =
    location.state && typeof location.state === 'object'
      ? (location.state as Record<string, unknown>)
      : undefined;

  useEffect(() => {
    if (postLoginState?.classId) {
      persistEnrollmentIntent({
        classId: String(postLoginState.classId),
        seasonId:
          typeof postLoginState.seasonId === 'string' ? postLoginState.seasonId : undefined,
        from: typeof postLoginState.from === 'string' ? postLoginState.from : undefined,
      });
    }
  }, [postLoginState?.classId, postLoginState?.seasonId, postLoginState?.from]);

  const {
    isLoading,
    message,
    codeStep,
    codeEmail,
    onSubmit,
    resetMessage,
    verifyEmailCode,
    resendEmailCode,
    backToCodeSend,
  } = useLogin({
    to: '/dashboard',
    state: postLoginState,
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-primary mb-2 text-center">
          {t('pages.login.title')}
        </h1>
        <p className="text-gray-600 text-center mb-8">
          {t('pages.login.subtitle')}
        </p>

        {/* Delegate form UI to component, logic to hook */}
        <LoginForm
          isLoading={isLoading}
          message={message}
          codeStep={codeStep}
          codeEmail={codeEmail}
          onSubmit={onSubmit}
          onVerifyEmailCode={verifyEmailCode}
          onResendEmailCode={resendEmailCode}
          onBackToCodeSend={backToCodeSend}
          onMessageDismiss={resetMessage}
        />

        {/* Help Text */}
        <p className="text-sm text-gray-600 text-center mt-6">
          {t('pages.login.no_account')}{' '}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/signup')}
            className="text-primary hover:underline focus-visible:outline-2 outline-primary outline-offset-2"
          >
            {t('pages.login.signup')}
          </Button>
        </p>
      </div>
    </div>
  );
}
