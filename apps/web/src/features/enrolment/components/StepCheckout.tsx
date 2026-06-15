import { useTranslation } from 'react-i18next';
import type { Engagement } from '@shared/schemas';
import { EnrolmentPaymentForm } from './EnrolmentPaymentForm';
import { StepBackButton } from './StepBackButton';

export interface StepCheckoutProps {
  enrolmentData: Partial<Engagement>;
  checkoutEnrolmentId: string | null;
  checkoutError: string | null;
  isPreparing: boolean;
  requireAuth: boolean;
  onPaymentSuccess: () => void;
  onPrevious: () => void;
  canGoBack?: boolean;
}

export function StepCheckout({
  enrolmentData,
  checkoutEnrolmentId,
  checkoutError,
  isPreparing,
  requireAuth,
  onPaymentSuccess,
  onPrevious,
  canGoBack = true,
}: StepCheckoutProps) {
  const { t } = useTranslation();

  if (!enrolmentData.offering_id || !enrolmentData.season_id) {
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

  if (isPreparing || !checkoutEnrolmentId) {
    return (
      <div className="space-y-4">
        <p role="status">{t('common.loading')}</p>
        <StepBackButton onPrevious={onPrevious} canGoBack={canGoBack} className="w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('enrolment.checkout_desc')}</p>
      <EnrolmentPaymentForm
        classId={enrolmentData.offering_id}
        engagementId={checkoutEnrolmentId}
        requireAuth={requireAuth}
        onPaid={onPaymentSuccess}
        onPrevious={onPrevious}
      />
    </div>
  );
}
