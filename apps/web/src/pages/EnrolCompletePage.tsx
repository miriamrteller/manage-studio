import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { WaiverStep } from '@/features/enrolment/components/WaiverStep';
import { TenantDB } from '@/lib/db';
import { ConsentTemplateSchema } from '@shared/schemas';
import type { ConsentTemplate } from '@shared/schemas';
import { linkAuthUserToPerson } from '@/features/enrolment/linkAuthUser';

type PageState =
  | { kind: 'loading' }
  | { kind: 'link_expired'; email: string }
  | { kind: 'ready'; personId: string; offeringId: string; template: ConsentTemplate }
  | { kind: 'already_signed' }
  | { kind: 'cancelled' }
  | { kind: 'signed' }
  | { kind: 'error'; message: string };

/**
 * EnrolCompletePage — /enrol/complete?engagementId=...
 *
 * Reached by clicking the magic link in the post-payment confirmation email.
 * Handles:
 *  - Session verification (redirects to re-send email form if link expired)
 *  - Account linking for brand-new guest users (no user_profiles row yet)
 *  - Loading the pending_waiver engagement + active consent template
 *  - Rendering WaiverStep for the guest to sign
 *  - Post-sign success screen
 */
export default function EnrolCompletePage() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [searchParams] = useSearchParams();
  const engagementId = searchParams.get('engagementId') ?? '';

  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [resendEmail, setResendEmail] = useState('');
  const [resendSent, setResendSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current || !engagementId) return;
    hasInitialized.current = true;

    const init = async () => {
      // 1. Verify auth session — magic link may have expired
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;

      if (!session?.user) {
        setState({ kind: 'link_expired', email: '' });
        return;
      }

      // 2. Try to link the auth user to the unlinked guest person record.
      //    Uses get_engagement_person_id RPC (only returns id when people.user_profile_id IS NULL)
      //    so it's safe to call even if the person is already linked.
      try {
        const { data: personIdToLink } = await supabase.rpc('get_engagement_person_id', {
          p_engagement_id: engagementId,
        });
        if (personIdToLink) {
          await linkAuthUserToPerson(personIdToLink as string);
        }
      } catch (linkErr) {
        // Linking failure is non-fatal — the waiver can still be signed
        console.warn('[EnrolCompletePage] person linking failed:', linkErr);
      }

      // 3. Fetch engagement via RPC (authorised by JWT email matching people.email)
      const { data: engagementRows, error: engError } = await supabase.rpc(
        'get_pending_waiver_engagement',
        { p_engagement_id: engagementId },
      );

      if (engError || !engagementRows?.length) {
        setState({
          kind: 'error',
          message: t('pages.enrol_complete.engagement_not_found'),
        });
        return;
      }

      const eng = engagementRows[0] as {
        person_id: string;
        offering_id: string;
        current_status: string;
      };

      if (eng.current_status === 'active') {
        setState({ kind: 'already_signed' });
        return;
      }

      if (eng.current_status === 'cancelled') {
        setState({ kind: 'cancelled' });
        return;
      }

      // 4. Fetch tenant (for template query)
      if (!tenant) {
        // tenant loads asynchronously; retry will happen on next render
        setState({ kind: 'loading' });
        return;
      }

      // 5. Get the active consent template
      const { data: templateRow, error: tmplError } = await TenantDB.selectFor(
        'consent_templates',
        tenant,
      )
        .eq('status', 'active')
        .maybeSingle();

      if (tmplError || !templateRow) {
        setState({
          kind: 'error',
          message: t('pages.enrol_complete.no_active_template'),
        });
        return;
      }

      const template = ConsentTemplateSchema.parse(templateRow);
      setState({
        kind: 'ready',
        personId: eng.person_id,
        offeringId: eng.offering_id,
        template,
      });
    };

    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagementId, tenant]);

  // Re-run init when tenant loads (first render may have no tenant yet)
  useEffect(() => {
    if (state.kind === 'loading' && tenant && engagementId && hasInitialized.current) {
      hasInitialized.current = false; // allow re-init
    }
  }, [state.kind, tenant, engagementId]);

  const handleResend = async () => {
    if (!resendEmail.trim()) return;
    setResendLoading(true);
    try {
      await supabase.auth.signInWithOtp({
        email: resendEmail.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?pendingWaiverEngagementId=${encodeURIComponent(engagementId)}`,
        },
      });
      setResendSent(true);
    } catch {
      // ignore — Supabase doesn't expose email existence
      setResendSent(true);
    } finally {
      setResendLoading(false);
    }
  };

  if (!engagementId) {
    return (
      <PageShell>
        <ErrorCard message={t('pages.enrol_complete.missing_id')} />
      </PageShell>
    );
  }

  if (state.kind === 'loading') {
    return (
      <PageShell>
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </PageShell>
    );
  }

  if (state.kind === 'link_expired') {
    return (
      <PageShell>
        <div className="space-y-5">
          <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-5">
            <h2 className="text-base font-bold text-amber-900 mb-2">
              {t('pages.enrol_complete.link_expired_heading')}
            </h2>
            <p className="text-sm text-amber-800">
              {t('pages.enrol_complete.link_expired_body')}
            </p>
          </div>

          {!resendSent ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                {t('pages.enrol_complete.your_email_label')}
              </label>
              <input
                type="email"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder={t('pages.enrol_complete.email_placeholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleResend();
                }}
              />
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleResend()}
                disabled={!resendEmail.trim() || resendLoading}
                className="w-full"
              >
                {resendLoading
                  ? t('common.loading')
                  : t('pages.enrol_complete.resend_btn')}
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-800">
              <p className="font-semibold mb-1">{t('pages.enrol_complete.resend_sent_heading')}</p>
              <p>{t('pages.enrol_complete.resend_sent_body')}</p>
            </div>
          )}
        </div>
      </PageShell>
    );
  }

  if (state.kind === 'already_signed') {
    return (
      <PageShell>
        <div className="text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-lg font-semibold">{t('pages.enrol_complete.already_signed_heading')}</h2>
          <p className="text-gray-600">{t('pages.enrol_complete.already_signed_body')}</p>
          <Button
            type="button"
            variant="primary"
            onClick={() => { window.location.href = '/dashboard'; }}
            className="w-full"
          >
            {t('pages.enrol_complete.go_to_dashboard')}
          </Button>
        </div>
      </PageShell>
    );
  }

  if (state.kind === 'cancelled') {
    return (
      <PageShell>
        <div className="text-center space-y-4">
          <div className="text-5xl">❌</div>
          <h2 className="text-lg font-semibold">{t('pages.enrol_complete.cancelled_heading')}</h2>
          <p className="text-gray-600">{t('pages.enrol_complete.cancelled_body')}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => { window.location.href = '/classes'; }}
            className="w-full"
          >
            {t('pages.enrol_complete.browse_classes')}
          </Button>
        </div>
      </PageShell>
    );
  }

  if (state.kind === 'signed') {
    return (
      <PageShell>
        <div className="text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-lg font-semibold">{t('pages.enrol_complete.signed_heading')}</h2>
          <p className="text-gray-600">{t('pages.enrol_complete.signed_body')}</p>
          <Button
            type="button"
            variant="primary"
            onClick={() => { window.location.href = '/dashboard'; }}
            className="w-full"
          >
            {t('pages.enrol_complete.go_to_dashboard')}
          </Button>
        </div>
      </PageShell>
    );
  }

  if (state.kind === 'error') {
    return (
      <PageShell>
        <ErrorCard message={state.message} />
      </PageShell>
    );
  }

  // state.kind === 'ready'
  return (
    <PageShell>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {t('pages.enrol_complete.sign_prompt')}
        </p>
        <WaiverStep
          personId={state.personId}
          template={state.template}
          offeringId={state.offeringId}
          onComplete={() => setState({ kind: 'signed' })}
          onPrevious={() => { /* no back on standalone page */ }}
          canGoBack={false}
        />
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-10 px-4 pb-16">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {t('pages.enrol_complete.page_title')}
        </h1>
        {children}
      </div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border-2 border-red-400 bg-red-50 p-5 space-y-3">
      <p className="text-sm text-red-800">{message}</p>
      <Button
        type="button"
        variant="secondary"
        onClick={() => { window.location.href = '/'; }}
      >
        {t('common.go_home')}
      </Button>
    </div>
  );
}
