import { useTranslation } from 'react-i18next';
import type { Engagement } from '@shared/schemas';
import type { CheckoutChargePayload } from '../lib/checkoutBootstrapTypes';
import { EnrolmentPaymentForm } from './EnrolmentPaymentForm';
import { StepBackButton } from './StepBackButton';
import { formatOfferingPrice } from '@/lib/formatOfferingPrice';

export interface StepCheckoutProps {
  enrolmentData: Partial<Engagement>;
  checkoutEnrolmentId: string | null;
  checkoutCharge: CheckoutChargePayload | null;
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
  checkoutCharge,
  checkoutError,
  isPreparing,
  requireAuth,
  onPaymentSuccess,
  onPrevious,
  canGoBack = true,
}: StepCheckoutProps) {
  const { t, i18n } = useTranslation();

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

  const isMonthly =
    checkoutCharge?.billingMode === 'recurring' && checkoutCharge?.billingInterval === 'monthly';

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('enrolment.checkout_desc')}</p>
      {checkoutCharge?.amountMinor != null && checkoutCharge.currency && (
        <div className="rounded-lg bg-muted/40 px-3 py-2 space-y-1">
          <p className="text-sm font-medium">
            {t('enrolment.checkout_total')}:{' '}
            {formatOfferingPrice(
              t,
              checkoutCharge.amountMinor,
              checkoutCharge.currency,
              i18n.language,
              {
                billing_mode: checkoutCharge.billingMode,
                billing_interval: checkoutCharge.billingInterval,
              },
            )}
          </p>
          {isMonthly && (
            <p className="text-xs text-muted-foreground">{t('enrolment.checkout_monthly_hint')}</p>
          )}
        </div>
      )}
      <EnrolmentPaymentForm
        classId={enrolmentData.offering_id}
        engagementId={checkoutEnrolmentId}
        requireAuth={requireAuth}
        preloadedCharge={checkoutCharge}
        onPaid={onPaymentSuccess}
        onPrevious={onPrevious}
      />
    </div>
  );
}
