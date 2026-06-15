import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { TokenEnrolmentPaymentForm } from '@/features/enrolment/components/EnrolmentPaymentForm';
import { WaiverStep } from '@/features/enrolment/components/WaiverStep';
import type { TokenCompletionData } from '@/features/enrolment/lib/enrolmentCompletionTypes';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@shared/format';

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

  const tokenQuery = useQuery({
    queryKey: ['enrol-pay-token-detail', engagementId, effectiveToken],
    queryFn: async () => {
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-enrolment-completion`;
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `WaiverToken ${effectiveToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
      });
      const data = (await resp.json()) as Record<string, unknown>;
      if (!resp.ok) {
        throw new Error((data.error as string) ?? t('common.error'));
      }
      return data as unknown as TokenCompletionData;
    },
    enabled: !!engagementId && !!effectiveToken,
  });

  useEffect(() => {
    if (tokenStripped || !tokenInUrl || !tokenQuery.isSuccess) return;
    const next = new URLSearchParams(searchParams);
    next.delete('t');
    setSearchParams(next, { replace: true });
    setTokenStripped(true);
  }, [tokenInUrl, tokenQuery.isSuccess, tokenStripped, searchParams, setSearchParams]);

  useEffect(() => {
    if (!tokenQuery.isLoading) {
      setShowSlowLoadingHelp(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowSlowLoadingHelp(true);
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [tokenQuery.isLoading]);

  const tokenPayload = tokenQuery.data;

  const tokenShowWaiver = useMemo(
    () =>
      Boolean(
        tokenPayload?.waiverRequired &&
          !tokenPayload.waiverAlreadySigned &&
          !waiverComplete &&
          tokenPayload.template,
      ),
    [tokenPayload, waiverComplete],
  );

  if (tokenQuery.isLoading) {
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
            <Button variant="outline" className="w-full" onClick={() => void tokenQuery.refetch()}>
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

  if (tokenQuery.error || !tokenPayload) {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-4">
        <p className="text-destructive">
          {tokenQuery.error instanceof Error ? tokenQuery.error.message : t('common.error')}
        </p>
        <p className="text-sm text-gray-600">
          {t('pages.enrol_pay.error_recovery_help', {
            defaultValue:
              'If this link has expired or was opened incorrectly, retry first. If it still fails, request a new completion link from the school.',
          })}
        </p>
        <div className="space-y-2">
          <Button variant="outline" className="w-full" onClick={() => void tokenQuery.refetch()}>
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
            const base = `/enrol/pay/${encodeURIComponent(tokenPayload.engagementId)}`;
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

  const alreadyPaid = tokenPayload.alreadyComplete || paid;
  if (alreadyPaid) {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-4 text-center">
        <h1 className="text-2xl font-bold">{t('pages.enrol_pay.already_paid_title')}</h1>
        <p className="text-gray-600">{t('pages.enrol_pay.already_paid_desc')}</p>
        <Button variant="primary" onClick={() => navigate('/classes')}>
          {t('common.close')}
        </Button>
      </div>
    );
  }

  if (tokenShowWaiver && tokenPayload.template) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <WaiverStep
          personId={tokenPayload.personId}
          template={tokenPayload.template}
          offeringId={tokenPayload.offeringId}
          waiverToken={effectiveToken}
          studentName={tokenPayload.studentName}
          className={tokenPayload.className}
          isMinorStudent={tokenPayload.isMinorStudent}
          onComplete={() => setWaiverComplete(true)}
          onPrevious={() => navigate('/classes')}
          canGoBack
        />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{t('pages.enrol_pay.title')}</h1>

      <div className="rounded-lg border border-gray-200 p-4 space-y-2">
        <p className="font-medium">{tokenPayload.className}</p>
        <p className="text-sm text-gray-600">
          {t('pages.admin_enrol.amount_due')}:{' '}
          {formatCurrency(tokenPayload.amountMinor, tokenPayload.currency, i18n.language)}
        </p>
      </div>

      <TokenEnrolmentPaymentForm
        classId={tokenPayload.offeringId}
        engagementId={tokenPayload.engagementId}
        enrolmentToken={effectiveToken}
        onPaid={() => setPaid(true)}
        onPrevious={() => navigate('/classes')}
      />
    </div>
  );
}
