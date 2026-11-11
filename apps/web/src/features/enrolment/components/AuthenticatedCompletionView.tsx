import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EnrolmentPaymentSuccess } from '@/features/enrolment/components/EnrolmentPaymentSuccess';
import { CheckoutPaymentShell } from '@/features/enrolment/components/CheckoutPaymentShell';
import { useCheckoutBootstrap } from '@/features/enrolment/hooks/useCheckoutBootstrap';
import { resolvePendingEnrolmentAction } from '@/features/enrolment/lib/pendingEnrolmentAction';
import { EnrolmentService } from '@/features/enrolment/service';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { hasParentRole } from '@/lib/parentRoles';
import { buildPortalHighlightState } from '@/lib/portalHighlight';
import queryClient from '@/lib/query-client';
import { formatOfferingPrice } from '@/lib/formatOfferingPrice';
import type { Engagement } from '@shared/schemas';
import { monthlyHintKey } from '@/features/enrolment/lib/monthlyHint';

interface AuthenticatedCompletionViewProps {
  engagementId: string | undefined;
}

export function AuthenticatedCompletionView({ engagementId }: AuthenticatedCompletionViewProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useCurrentUser();
  const tenant = useTenant();
  const [linkingWaiver, setLinkingWaiver] = useState(false);
  const [paid, setPaid] = useState(false);

  const bootstrap = useCheckoutBootstrap({
    phase: 'pay',
    mode: 'existing_engagement',
    engagementId,
    enabled: !!tenant?.id && !!engagementId && !!user,
  });

  const context = bootstrap.context;
  const charge = bootstrap.charge;

  useEffect(() => {
    if (!tenant || !engagementId || !context?.waiverAlreadySigned || !context.waiverEvidenceId) {
      return;
    }

    let cancelled = false;
    setLinkingWaiver(true);
    void EnrolmentService.get(tenant, engagementId)
      .then((enrolment) => {
        if (enrolment.waiver_evidence_id === context.waiverEvidenceId) return null;
        return EnrolmentService.update(tenant, engagementId, {
          waiver_evidence_id: context.waiverEvidenceId,
        });
      })
      .catch((err) => {
        console.error('[AuthenticatedCompletionView] waiver link failed:', err);
      })
      .finally(() => {
        if (!cancelled) setLinkingWaiver(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenant, engagementId, context?.waiverAlreadySigned, context?.waiverEvidenceId]);

  useEffect(() => {
    if (context?.status !== 'pending_waiver' || !engagementId) return;
    const waiverAction = resolvePendingEnrolmentAction('pending_waiver', engagementId);
    if (waiverAction) {
      navigate(waiverAction.path, { replace: true });
    }
  }, [context?.status, engagementId, navigate]);

  if (authLoading) {
    return (
      <div className="p-8 text-center" role="status">
        {t('common.loading')}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-4">
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded p-3">
          {t('pages.enrol_pay.secure_link_required', {
            defaultValue:
              'This page requires a secure completion link. Open the full link from the email, or sign in to continue.',
          })}
        </p>
        <Button
          variant="outline"
          onClick={() =>
            navigate('/login', {
              state: { from: `/enrol/pay/${engagementId ?? ''}` },
            })
          }
        >
          {t('pages.login.title', { defaultValue: 'Sign in' })}
        </Button>
      </div>
    );
  }

  if (bootstrap.isLoading || linkingWaiver) {
    return (
      <div className="p-8 text-center" role="status">
        {t('common.loading')}
      </div>
    );
  }

  if (bootstrap.loadError || !context) {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-4">
        <p className="text-destructive">
          {bootstrap.loadError ?? t('common.error')}
        </p>
        <Button variant="outline" onClick={() => navigate('/classes')}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  if (context.status === 'pending_waiver') {
    return (
      <div className="p-8 text-center" role="status">
        {t('common.loading')}
      </div>
    );
  }

  const finishCompletion = async () => {
    if (user && hasParentRole(user.role)) {
      await queryClient.invalidateQueries({ queryKey: ['parent-portal'] });
      navigate('/dashboard/portal', {
        state: buildPortalHighlightState({
          id: context.engagementId,
          person_id: context.personId,
          offering_id: context.offeringId,
        } as Engagement),
      });
      return;
    }
    navigate('/classes');
  };

  // Owner rule: nothing ever blocks payment. The form is signed after paying
  // (pending_waiver, handled above), never in front of the payment.
  if (context.alreadyComplete || paid) {
    return (
      <EnrolmentPaymentSuccess
        appointment={context.appointment}
        onClose={() => void finishCompletion()}
        closeLabel={
          user && hasParentRole(user.role)
            ? t('pages.portal.view_enrolment')
            : t('common.close')
        }
      />
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
          <p className="text-xs text-gray-500">{t(monthlyHintKey(charge?.paymentProvider))}</p>
        )}
      </div>

      <CheckoutPaymentShell
        classId={context.offeringId}
        engagementId={context.engagementId}
        charge={charge}
        onPaid={() => setPaid(true)}
        onPrevious={() => void finishCompletion()}
      />
    </div>
  );
}
