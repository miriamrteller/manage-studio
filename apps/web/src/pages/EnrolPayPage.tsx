import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { EnrolmentPaymentForm } from '@/features/enrolment/components/EnrolmentPaymentForm';
import { WaiverStep } from '@/features/enrolment/components/WaiverStep';
import { useWaiverStatus } from '@/features/enrolment/hooks/useWaiverStatus';
import { EnrolmentService } from '@/features/enrolment/service';
import { computeClassTotal } from '@/features/enrolment/lib/computeClassTotal';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { TenantDB } from '@/lib/db';
import { formatCurrency } from '@shared/format';
import { OfferingSchema } from '@shared/schemas';

/**
 * EnrolPayPage: Complete payment for a pending enrolment (e.g. from admin-sent link).
 */
export default function EnrolPayPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { engagementId } = useParams<{ engagementId: string }>();
  const { user, isLoading: authLoading } = useCurrentUser();
  const tenant = useTenant();
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login', {
        replace: true,
        state: { from: `/enrol/pay/${engagementId ?? ''}` },
      });
    }
  }, [user, authLoading, navigate, engagementId]);

  const detailQuery = useQuery({
    queryKey: ['enrol-pay-detail', tenant?.id, engagementId],
    queryFn: async () => {
      if (!tenant || !engagementId) throw new Error('Missing params');

      const enrolment = await EnrolmentService.get(tenant, engagementId);
      if (enrolment.status === 'active') {
        return { enrolment, classRow: null, alreadyPaid: true as const };
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

  // Hooks must be called unconditionally before any early returns
  // useWaiverStatus skips automatically when user is null (guest) via its enabled guard
  const waiverStatus = useWaiverStatus({
    personId: detailQuery.data?.enrolment.person_id,
    offeringId: detailQuery.data?.classRow?.id,
  });
  const [waiverComplete, setWaiverComplete] = useState(false);

  if (authLoading || !user) {
    return (
      <div className="p-8 text-center" role="status">
        {t('common.loading')}
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
          {detailQuery.error instanceof Error
            ? detailQuery.error.message
            : t('common.error')}
        </p>
        <Button variant="outline" onClick={() => navigate('/classes')}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const { enrolment, classRow, alreadyPaid } = detailQuery.data;

  const showWaiverFirst =
    !!(waiverStatus.data?.required && !waiverStatus.data?.signed) && !waiverComplete;

  if (alreadyPaid || paid) {
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
        <p className="font-medium">{classRow.name}</p>
        <p className="text-sm text-gray-600">
          {t('pages.admin_enrol.amount_due')}:{' '}
          {formatCurrency(pricing.totalMinor, pricing.currency, i18n.language)}
        </p>
      </div>

      <EnrolmentPaymentForm
        classId={classRow.id}
        engagementId={enrolment.id}
        onPaid={() => setPaid(true)}
        onPrevious={() => navigate('/classes')}
      />
    </div>
  );
}
