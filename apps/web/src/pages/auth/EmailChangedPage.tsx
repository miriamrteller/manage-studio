import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthSession } from '@/hooks/useAuth';

/**
 * /auth/email-changed: where a login-email confirmation link lands (through /auth/callback).
 * With secure email change, both addresses must confirm; this says what happens next.
 */
export default function EmailChangedPage() {
  const { t } = useTranslation();
  const { session } = useAuthSession();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-3xl font-bold text-primary">{t('login_email.confirmed_title')}</h1>
        <p role="status">{t('login_email.confirmed_body')}</p>
        <Link className="underline" to={session ? '/dashboard' : '/login'}>
          {session ? t('login_email.continue') : t('login_email.sign_in')}
        </Link>
      </div>
    </div>
  );
}
