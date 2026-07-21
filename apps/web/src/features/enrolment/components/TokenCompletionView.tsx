import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EnrolmentPaymentSuccess } from '@/features/enrolment/components/EnrolmentPaymentSuccess';
import { CheckoutPaymentShell } from '@/features/enrolment/components/CheckoutPaymentShell';
import { WaiverStep } from '@/features/enrolment/components/WaiverStep';
import { useCheckoutBootstrap } from '@/features/enrolment/hooks/useCheckoutBootstrap';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { formatOfferingPrice } from '@/lib/formatOfferingPrice';
import type { ConsentTemplate } from '@shared/schemas';

interface TokenCompletionViewProps {
  engagementId: string;
  effectiveToken: string;
}

export function TokenCompletionView({ engagementId, effectiveToken }: TokenCompletionViewProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useCurrentUser();
  const [paid, setPaid] = useState(false);
  const [waiverComplete, setWaiverComplete] = useState(false);
  const [tokenStripped, setTokenStripped] = useState(false);
  const [showSlowLoadingHelp, setShowSlowLoadingHelp] = useState(false);

  const tokenInUrl = searchParams.get('t');
  const tokenReturnPath = `/enrol/pay/${encodeURIComponent(engagementId)}?t=${encodeURIComponent(effectiveToken)}`;

  const bootstrap = useCheckoutBootstrap({
    phase: 'pay',
    mode: 'existing_engagement',
    engagementId,
    enrolmentToken: effectiveToken,
    enabled: Boolean(engagementId && effectiveToken),
  });

  const context = bootstrap.context;
  const charge = bootstrap.charge;

  useEffect(() => {
    if (tokenStripped || !tokenInUrl || !context) return;
    const next = new URLSearchParams(searchParams);
    next.delete('t');
    setSearchParams(next, { replace: true });
    setTokenStripped(true);
  }, [tokenInUrl, context, tokenStripped, searchParams, setSearchParams]);

  useEffect(() => {
    if (!bootstrap.isLoading) {
      setShowSlowLoadingHelp(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowSlowLoadingHelp(true);
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [bootstrap.isLoading]);

  const tokenShowWaiver = useMemo(
    () =>
      Boolean(
        context?.waiverRequired &&
          !context.waiverAlreadySigned &&
          !waiverComplete &&
          context.template,
      ) || bootstrap.blockReason === 'waiver_required',
    [context, waiverComplete, bootstrap.blockReason],
  );

  const waiverTemplate = context?.template as ConsentTemplate | null;

  if (bootstrap.isLoading) {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-4 text-center">
        <p role="status">{t('common.loading')}</p>
        {showSlowLoadingHelp && (
          <div className="space-y-3 text-start">
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded p-3">
              {t('pages.enrol_pay.slow_link_help', {
                defaultValue:
                  'This secure link is taking longer than expected. You can retry or refresh this page.',
              })}
            </p>
            <Button variant="outline" className="w-full" onClick={() => void bootstrap.refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                window.location.href = tokenReturnPath;
              }}
            >
              {t('pages.enrol_pay.refresh_secure_link', { defaultValue: 'Refresh secure link' })}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() =>
                navigate('/login', {
                  state: { from: tokenReturnPath },
                })
              }
            >
              {t('pages.login.title', { defaultValue: 'Sign in' })}
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (bootstrap.loadError || !context) {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-4">
        <p className="text-destructive">
          {bootstrap.loadError ?? t('common.error')}
        </p>
        <p className="text-sm text-gray-600">
          {t('pages.enrol_pay.error_recovery_help', {
            defaultValue:
              'If this link has expired or was opened incorrectly, retry first. If it still fails, request a new completion link from the school.',
          })}
        </p>
        <div className="space-y-2">
          <Button variant="outline" className="w-full" onClick={() => void bootstrap.refetch()}>
            {t('common.retry', { defaultValue: 'Retry' })}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              window.location.href = tokenReturnPath;
            }}
          >
            {t('pages.enrol_pay.refresh_secure_link', { defaultValue: 'Refresh secure link' })}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate('/classes')}>
            {t('common.back')}
          </Button>
        </div>
      </div>
    );
  }

  const roles = user?.role ?? [];
  if (roles.includes('tenant_admin') || roles.includes('super_admin')) {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-4">
        <p className="text-amber-800 bg-amber-50 border border-amber-300 rounded p-3">
          {t('pages.enrol_pay.admin_session_block', {
            defaultValue:
              'This completion link is for the guardian. Sign out of the admin account or open the link in a private window.',
          })}
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            const tokenForRedirect = effectiveToken;
            await supabase.auth.signOut();
            const base = `/enrol/pay/${encodeURIComponent(context.engagementId)}`;
            const withToken = tokenForRedirect
              ? `${base}?t=${encodeURIComponent(tokenForRedirect)}`
              : base;
            window.location.href = withToken;
          }}
        >
          {t('pages.enrol_pay.sign_out_and_continue', { defaultValue: 'Sign out and continue' })}
        </Button>
      </div>
    );
  }

  const alreadyPaid = context.alreadyComplete || paid;
  if (alreadyPaid) {
    return (
      <EnrolmentPaymentSuccess
        appointment={context.appointment}
        onClose={() => navigate('/classes')}
        closeLabel={t('common.close')}
      />
    );
  }

  if (tokenShowWaiver && waiverTemplate) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <WaiverStep
          personId={context.personId}
          template={waiverTemplate}
          offeringId={context.offeringId}
          waiverToken={effectiveToken}
          studentName={context.studentName}
          className={context.className}
          isMinorStudent={context.isMinorStudent}
          onComplete={() => {
            setWaiverComplete(true);
            void bootstrap.refetch();
          }}
          onPrevious={() => navigate('/classes')}
          canGoBack
        />
      </div>
    );
  }

  if (!charge) {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-4">
        <p className="text-destructive">{t('enrolment.payment_setup_failed')}</p>
        <Button variant="outline" onClick={() => void bootstrap.refetch()}>
          {t('common.retry', { defaultValue: 'Retry' })}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{t('pages.enrol_pay.title')}</h1>

      <div className="rounded-lg border border-gray-200 p-4 space-y-2">
        <p className="font-medium">{context.className}</p>
        <p className="text-sm text-gray-600">
          {t('pages.admin_enrol.amount_due')}:{' '}
          {formatOfferingPrice(t, context.amountMinor, context.currency, i18n.language, {
            billing_mode: context.billingMode,
            billing_interval: context.billingInterval,
          })}
        </p>
        {context.billingMode === 'recurring' && context.billingInterval === 'monthly' && (
          <p className="text-xs text-gray-500">{t('enrolment.checkout_monthly_hint')}</p>
        )}
      </div>

      <CheckoutPaymentShell
        classId={context.offeringId}
        engagementId={context.engagementId}
        enrolmentToken={effectiveToken}
        charge={charge}
        onPaid={() => setPaid(true)}
        onPrevious={() => navigate('/classes')}
      />
    </div>
  );
}
