import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { openSignInLink, signInTokenFromHash } from '@/features/auth/lib/clientSignIn';

/**
 * /signin#t=<token> — the "Go to my page" button in a booking confirmation email.
 * Signs the client in (valid 3 days) and opens their page. The token rides in the
 * fragment and is dropped from the address straight away.
 */
export default function SignInLinkPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = signInTokenFromHash(window.location.hash);
    window.history.replaceState(null, '', '/signin');
    if (!token) {
      setFailed(true);
      return;
    }
    openSignInLink(token)
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => setFailed(true));
  }, [navigate]);

  return (
    <div className="mx-auto max-w-md space-y-3 p-8 text-center">
      <h1 className="text-xl font-semibold">{t('pages.sign_in_link.title')}</h1>
      {failed ? (
        <>
          <p className="text-sm text-error" role="alert">{t('pages.sign_in_link.expired')}</p>
          <Link className="text-sm font-medium underline" to="/login">
            {t('pages.sign_in_link.sign_in')}
          </Link>
        </>
      ) : (
        <p className="text-sm text-muted-foreground" role="status">{t('pages.sign_in_link.opening')}</p>
      )}
    </div>
  );
}
