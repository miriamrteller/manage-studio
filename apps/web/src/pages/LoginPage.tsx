import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '../components/Auth/LoginForm';
import { useLogin } from '../hooks/useLogin';

/**
 * LoginPage: Light composition page
 * - Acts as a route container, not a logic container
 * - Composes PublicLayout + LoginForm component
 * - Delegates form logic to useLogin hook
 * - WCAG: Semantic structure maintained in child components
 */

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, message, onSubmit, resetMessage } = useLogin();

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
          onSubmit={onSubmit}
          onMessageDismiss={resetMessage}
        />

        {/* Help Text */}
        <p className="text-sm text-gray-600 text-center mt-6">
          {t('pages.login.no_account')}{' '}
          <button
            onClick={() => navigate('/signup')}
            className="text-primary hover:underline focus-visible:outline-2 outline-primary outline-offset-2"
          >
            {t('pages.login.signup')}
          </button>
        </p>
      </div>
    </div>
  );
}
