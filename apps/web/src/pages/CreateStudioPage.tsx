import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LegalFooterLinks } from '@/components/LegalFooterLinks';
import { OpalSwiftShell } from '@/components/OpalSwiftShell';
import { useAuthSession } from '@/hooks/useAuth';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { tenantOrigin } from '@/lib/tenantUrl';
import { isPlatformAppHost } from '@/lib/resolveTenantSubdomain';
import {
  captureAuthCallbackUrl,
  clearAuthCallbackUrl,
  establishSessionFromAuthCallback,
} from '@/lib/authCallback';
import { OperatorOnboardingWizard } from '@/features/platform/components/OperatorOnboardingWizard';
import { TurnstileWidget } from '@/components/captcha/TurnstileWidget';
import { LegalPackPanel } from '@/components/legal/LegalPackPanel';
import {
  isSelfServeSignupEnabled,
  sendSelfServeConfirmation,
  studioHandoffUrl,
  turnstileSiteKey,
  type SelfServeStudioResult,
} from '@/features/self-serve/selfServeSignup';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The confirmation email's link lands here with ?token_hash=… (send-auth-email). */
function hasAuthLinkParams(url: { search: string; hash: string }): boolean {
  return /[?&](token_hash|code)=/.test(url.search) || /access_token=/.test(url.hash);
}

/**
 * app.opalswift.com/create-studio: self-serve studio signup (free beta, no card).
 * 1. Name + email → confirmation link (the account has no studio until step 2).
 * 2. The link signs them in here → the setup wizard in self-serve mode.
 * 3. Studio created → "Go to your studio" signs them in on its own address.
 */
export default function CreateStudioPage() {
  if (!isSelfServeSignupEnabled() || !isPlatformAppHost()) return <Navigate to="/login" replace />;
  return (
    <OpalSwiftShell footer={<LegalFooterLinks />}>
      <SelfServeSignup />
    </OpalSwiftShell>
  );
}

function SelfServeSignup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const callbackUrl = useRef(captureAuthCallbackUrl());
  const [linkState, setLinkState] = useState<'none' | 'checking' | 'failed'>(
    hasAuthLinkParams(callbackUrl.current) ? 'checking' : 'none',
  );
  const { session, isLoading: sessionLoading } = useAuthSession();
  const { user, isLoading: profileLoading, isProfileChecked } = useCurrentUser();
  const [created, setCreated] = useState<{ result: SelfServeStudioResult; name: string } | null>(null);

  useEffect(() => {
    if (linkState !== 'checking') return;
    let cancelled = false;
    void establishSessionFromAuthCallback(callbackUrl.current).then((result) => {
      if (cancelled) return;
      clearAuthCallbackUrl();
      setLinkState(result.ok ? 'none' : 'failed');
    });
    return () => {
      cancelled = true;
    };
  }, [linkState]);

  if (created) return <StudioReady result={created.result} name={created.name} />;

  if (linkState === 'checking' || sessionLoading || (session && (profileLoading || !isProfileChecked))) {
    return <p role="status">{linkState === 'checking' ? t('self_serve.signing_in') : t('common.loading')}</p>;
  }

  if (!session) return <StartForm linkFailed={linkState === 'failed'} />;

  // Any profile means the account already has a studio (or is the platform owner).
  if (user) {
    return (
      <>
        <h1 className="mb-6 text-3xl font-bold">{t('self_serve.has_studio_title')}</h1>
        <div>
          <Button variant="primary" onClick={() => navigate('/')}>
            {t('platform_welcome.your_studio')}
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="text-start">
      <p className="mb-4 text-sm text-gray-700">
        {t('self_serve.signed_in_as', { email: session.user.email ?? '' })}
      </p>
      <OperatorOnboardingWizard
        mode="self_serve"
        onSelfServeCreated={(result, name) => setCreated({ result, name })}
      />
    </div>
  );
}

function StartForm({ linkFailed }: { linkFailed: boolean }) {
  const { t, i18n } = useTranslation();
  const language: 'he' | 'en' = i18n.language.startsWith('he') ? 'he' : 'en';
  const siteKey = turnstileSiteKey();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = firstName.trim() !== '' && EMAIL_RE.test(email.trim()) && (!siteKey || Boolean(captchaToken));

  // Plain-words reason the button is greyed out.
  const missingHint =
    firstName.trim() === ''
      ? 'self_serve.need_first_name'
      : !EMAIL_RE.test(email.trim())
        ? 'self_serve.need_email'
        : siteKey && !captchaToken
          ? 'self_serve.captcha_needed'
          : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) {
      if (siteKey && !captchaToken) setError(t('self_serve.captcha_needed'));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendSelfServeConfirmation({ email, firstName, lastName, language, captchaToken });
      setSentTo(email.trim().toLowerCase());
      setResent(false);
      // A security-check token works once; a Resend needs a fresh one.
      setCaptchaToken(null);
    } catch {
      setError(t('self_serve.error_send'));
    } finally {
      setSending(false);
    }
  }

  async function onResend() {
    if (!sentTo || (siteKey && !captchaToken)) return;
    setSending(true);
    setError(null);
    try {
      await sendSelfServeConfirmation({ email: sentTo, firstName, lastName, language, captchaToken });
      setResent(true);
      setCaptchaToken(null);
    } catch {
      setError(t('self_serve.error_send'));
    } finally {
      setSending(false);
    }
  }

  if (sentTo) {
    return (
      <>
        <h1 className="mb-3 text-3xl font-bold">{t('self_serve.check_email_title')}</h1>
        <p className="mb-2 text-gray-700" role="status">
          {t('self_serve.check_email_body', { email: sentTo })}
        </p>
        <p className="mb-6 text-sm text-gray-700">{t('self_serve.check_spam')}</p>
        {siteKey && <TurnstileWidget siteKey={siteKey} language={language} onToken={setCaptchaToken} />}
        <div aria-live="polite" className="mb-3 min-h-5 text-sm">
          {resent && <span>{t('self_serve.resent', { email: sentTo })}</span>}
        </div>
        {error && <p className="mb-3 text-sm text-red-700" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" disabled={sending || (Boolean(siteKey) && !captchaToken)} onClick={() => void onResend()}>
            {sending ? t('self_serve.sending') : t('self_serve.resend')}
          </Button>
          <Button variant="outline" onClick={() => { setSentTo(null); setCaptchaToken(null); setResent(false); setError(null); }}>
            {t('self_serve.use_other_email')}
          </Button>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 text-start" noValidate>
      <h1 className="text-center text-3xl font-bold">{t('self_serve.start_title')}</h1>
      <p className="text-center text-gray-700">{t('self_serve.start_intro')}</p>
      {linkFailed && (
        <p className="text-sm text-red-700" role="alert">{t('self_serve.link_failed')}</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="sss-first">{t('self_serve.first_name')}</label>
          <input id="sss-first" className="form-input w-full" autoComplete="given-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="sss-last">{t('self_serve.last_name')}</label>
          <input id="sss-last" className="form-input w-full" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="sss-email">{t('self_serve.email')}</label>
        <input id="sss-email" type="email" dir="ltr" className="form-input w-full" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {siteKey && <TurnstileWidget siteKey={siteKey} language={language} onToken={setCaptchaToken} />}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {missingHint && (
        <p id="sss-hint" className="text-center text-sm text-gray-700" role="status">{t(missingHint)}</p>
      )}
      <div className="text-center">
        <Button type="submit" disabled={sending || !canSend} variant="primary" aria-describedby={missingHint ? 'sss-hint' : undefined}>
          {sending ? t('self_serve.sending') : t('self_serve.send_link')}
        </Button>
      </div>
    </form>
  );
}

function StudioReady({ result, name }: { result: SelfServeStudioResult; name: string }) {
  const { t } = useTranslation();
  const [going, setGoing] = useState(false);
  const address = tenantOrigin(result.subdomain).replace(/^https?:\/\//, '');

  async function goToStudio() {
    setGoing(true);
    const { data } = await supabase.auth.getSession();
    const url = studioHandoffUrl(result.subdomain, data.session);
    // The studio's address takes over this session; dropping it here stops both
    // hosts refreshing the same token. Local only: it is not a sign-out.
    if (data.session) await supabase.auth.signOut({ scope: 'local' });
    window.location.assign(url);
  }

  return (
    <section className="space-y-6 text-start">
      <h1 className="text-center text-3xl font-bold">{t('self_serve.created_title', { name })}</h1>
      <p>
        {t('self_serve.created_body')}{' '}
        <span dir="ltr" className="font-mono">{address}</span>
      </p>
      <LegalPackPanel tenantId={result.tenantId} mode="acknowledge" offerUploads />

      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('setup_guide.ready_title')}</h2>
        <p>{t('setup_guide.ready_body')}</p>
      </div>
      <div className="text-center">
        <Button onClick={() => void goToStudio()} disabled={going} variant="primary">
          {t('self_serve.go_to_studio')}
        </Button>
      </div>
    </section>
  );
}
