import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { EnrolmentPaymentForm } from '@/features/enrolment/components/EnrolmentPaymentForm';
import { WaiverStep } from '@/features/enrolment/components/WaiverStep';
import { useWaiverStatus } from '@/features/enrolment/hooks/useWaiverStatus';
import { computeClassTotal } from '@/features/enrolment/lib/computeClassTotal';
import { resolvePendingEnrolmentAction } from '@/features/enrolment/lib/pendingEnrolmentAction';
import { EnrolmentService } from '@/features/enrolment/service';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { hasParentRole } from '@/lib/parentRoles';
import { buildPortalHighlightState } from '@/lib/portalHighlight';
import queryClient from '@/lib/query-client';
import { TenantDB } from '@/lib/db';
import { formatCurrency } from '@shared/format';
import { OfferingSchema } from '@shared/schemas';

interface AuthenticatedCompletionViewProps {
  engagementId: string | undefined;
}

export function AuthenticatedCompletionView({ engagementId }: AuthenticatedCompletionViewProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useCurrentUser();
  const tenant = useTenant();
  const [waiverComplete, setWaiverComplete] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['enrol-pay-detail', tenant?.id, engagementId],
    queryFn: async () => {
      if (!tenant || !engagementId) throw new Error('Missing params');

      const enrolment = await EnrolmentService.get(tenant, engagementId);
      if (enrolment.status === 'active') {
        return { enrolment, classRow: null, alreadyPaid: true as const };
      }
      if (enrolment.status === 'pending_waiver') {
        return { enrolment, classRow: null, pendingWaiver: true as const };
      }
      if (enrolment.status !== 'pending_payment') {
        throw new Error(t('pages.enrol_pay.not_payable'));
      }

      const { data: classData, error: classError } = await TenantDB.selectFor('offerings', tenant)
        .eq('id', enrolment.offering_id)
        .single();
      if (classError) throw classError;

      return {
        enrolment,
        classRow: OfferingSchema.parse(classData),
        alreadyPaid: false as const,
      };
    },
    enabled: !!tenant?.id && !!engagementId && !!user,
  });

  const waiverStatus = useWaiverStatus({
    personId: detailQuery.data?.enrolment.person_id,
    offeringId: detailQuery.data?.classRow?.id,
  });

  useEffect(() => {
    if (detailQuery.data?.enrolment.status !== 'pending_waiver' || !engagementId) return;
    const waiverAction = resolvePendingEnrolmentAction('pending_waiver', engagementId);
    if (waiverAction) {
      navigate(waiverAction.path, { replace: true });
    }
  }, [detailQuery.data?.enrolment.status, engagementId, navigate]);

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

  if (detailQuery.isLoading) {
    return (
      <div className="p-8 text-center" role="status">
        {t('common.loading')}
      </div>
    );
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-4">
        <p className="text-destructive">
          {detailQuery.error instanceof Error ? detailQuery.error.message : t('common.error')}
        </p>
        <Button variant="outline" onClick={() => navigate('/classes')}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const { enrolment, classRow, alreadyPaid } = detailQuery.data;

  if (enrolment.status === 'pending_waiver') {
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
        state: buildPortalHighlightState(enrolment),
      });
      return;
    }
    navigate('/classes');
  };

  const showWaiverFirst = !!waiverStatus.data?.required && !waiverComplete;

  if (alreadyPaid) {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-4 text-center">
        <h1 className="text-2xl font-bold">{t('pages.enrol_pay.already_paid_title')}</h1>
        <p className="text-gray-600">{t('pages.enrol_pay.already_paid_desc')}</p>
        <Button variant="primary" onClick={finishCompletion}>
          {user && hasParentRole(user.role)
            ? t('pages.portal.view_enrolment')
            : t('common.close')}
        </Button>
      </div>
    );
  }

  if (!classRow || !tenant) {
    return null;
  }

  const pricing = computeClassTotal(classRow, tenant);

  if (showWaiverFirst && waiverStatus.data?.template) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <WaiverStep
          personId={enrolment.person_id}
          template={waiverStatus.data.template}
          offeringId={classRow.id}
          tenantIdForInvalidation={tenant.id}
          onComplete={() => setWaiverComplete(true)}
          onPrevious={() => void finishCompletion()}
          canGoBack
        />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{t('pages.enrol_pay.title')}</h1>

      <div className="rounded-lg border border-gray-200 p-4 space-y-2">
        <p className="font-medium">{classRow.name}</p>
        <p className="text-sm text-gray-600">
          {t('pages.admin_enrol.amount_due')}:{' '}
          {formatCurrency(pricing.totalMinor, pricing.currency, i18n.language)}
        </p>
      </div>

      <EnrolmentPaymentForm
        classId={classRow.id}
        engagementId={enrolment.id}
        onPaid={() => void finishCompletion()}
        onPrevious={() => void finishCompletion()}
      />
    </div>
  );
}
