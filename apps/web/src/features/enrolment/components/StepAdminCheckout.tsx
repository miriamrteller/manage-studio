import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { PersonService } from '@/features/people/service';
import { useTenant } from '@/hooks/useTenant';
import { TenantDB } from '@/lib/db';
import { OfferingSchema } from '@shared/schemas';
import type { Engagement } from '@shared/schemas';
import { AdminEnrolmentPaymentStep } from './AdminEnrolmentPaymentStep';
import type { AdminPaymentChoice } from './AdminEnrolmentPaymentStep';
import { StepBackButton } from './StepBackButton';

export interface StepAdminCheckoutProps {
  enrolmentData: Partial<Engagement>;
  checkoutEnrolmentId: string | null;
  checkoutError: string | null;
  isPreparing: boolean;
  onComplete: (result: {
    message: string;
    paymentChoice: AdminPaymentChoice;
    paymentUrl?: string;
    emailSent?: boolean;
    warning?: string;
  }) => void;
  onPrevious: () => void;
  canGoBack?: boolean;
}

export function StepAdminCheckout({
  enrolmentData,
  checkoutEnrolmentId,
  checkoutError,
  isPreparing,
  onComplete,
  onPrevious,
  canGoBack = true,
}: StepAdminCheckoutProps) {
  const { t } = useTranslation();
  const tenant = useTenant();

  const detailQuery = useQuery({
    queryKey: [
      'admin-enrol-checkout',
      tenant?.id,
      enrolmentData.person_id,
      enrolmentData.offering_id,
    ],
    queryFn: async () => {
      if (!tenant || !enrolmentData.person_id || !enrolmentData.offering_id) {
        throw new Error('Missing enrolment details');
      }

      const person = await PersonService.get(tenant, enrolmentData.person_id);
      const { data: offeringRow, error: offeringError } = await TenantDB.selectFor('offerings', tenant)
        .eq('id', enrolmentData.offering_id)
        .single();
      if (offeringError) throw offeringError;

      const offering = OfferingSchema.parse(offeringRow);
      let guardianEmail: string | null = person.email ?? null;
      let guardianName: string | null = person.name;

      if (person.account_id) {
        const { data: holderRow } = await TenantDB.selectFor('account_members', tenant)
          .eq('account_id', person.account_id)
          .eq('role', 'account_holder')
          .maybeSingle();
        if (holderRow?.person_id) {
          const guardian = await PersonService.get(tenant, holderRow.person_id as string);
          guardianEmail = guardian.email ?? guardianEmail;
          guardianName = guardian.name;
        }
      }

      return { person, offering, guardianEmail, guardianName };
    },
    enabled: !!tenant?.id && !!enrolmentData.person_id && !!enrolmentData.offering_id,
  });

  if (!enrolmentData.offering_id || !enrolmentData.person_id) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive" role="alert">
          {t('enrolment.missing_class_or_term')}
        </p>
        <StepBackButton onPrevious={onPrevious} canGoBack={canGoBack} className="w-full" />
      </div>
    );
  }

  if (checkoutError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive" role="alert">
          {checkoutError}
        </p>
        <StepBackButton onPrevious={onPrevious} canGoBack={canGoBack} className="w-full" />
      </div>
    );
  }

  if (isPreparing || !checkoutEnrolmentId || detailQuery.isLoading || !detailQuery.data || !tenant) {
    return (
      <div className="space-y-4">
        <p role="status">{t('common.loading')}</p>
        <StepBackButton onPrevious={onPrevious} canGoBack={canGoBack} className="w-full" />
      </div>
    );
  }

  if (detailQuery.error) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive" role="alert">
          {detailQuery.error instanceof Error ? detailQuery.error.message : t('common.error')}
        </p>
        <StepBackButton onPrevious={onPrevious} canGoBack={canGoBack} className="w-full" />
      </div>
    );
  }

  const { person, offering, guardianEmail, guardianName } = detailQuery.data;

  return (
    <AdminEnrolmentPaymentStep
      tenant={tenant}
      engagementId={checkoutEnrolmentId}
      personId={person.id}
      personName={person.name}
      familyId={person.account_id}
      guardianEmail={guardianEmail}
      guardianName={guardianName}
      classRow={offering}
      emailInputId="stepper-payment-link-email"
      offlineMethodId="stepper-offline-method"
      onComplete={onComplete}
      onPrevious={onPrevious}
    />
  );
}
