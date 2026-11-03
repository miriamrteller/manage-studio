import type { Dispatch, SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import type { TenantConfig } from '@/types/auth';
import type { Engagement } from '@shared/schemas';
import { EnrolmentService } from '../service';
import type { EnrolmentStep } from '../types/enrolmentStep';

/**
 * After a card payment: wait (up to ~15s) for the enrolment to turn active,
 * then show the confirmation step.
 */
export function useEnrolmentPaymentSuccess({
  tenant,
  checkoutEnrolmentId,
  setCurrentStep,
  setEnrolmentData,
  setCheckoutError,
  t,
}: {
  tenant: TenantConfig | null;
  checkoutEnrolmentId: string | null | undefined;
  setCurrentStep: (step: EnrolmentStep) => void;
  setEnrolmentData: Dispatch<SetStateAction<Partial<Engagement>>>;
  setCheckoutError: (message: string | null) => void;
  t: TFunction;
}) {
  return async () => {
    if (!checkoutEnrolmentId || !tenant) return;

    const poll = async (attempts = 10): Promise<Engagement | null> => {
      const enrolment = await EnrolmentService.get(
        {
          id: tenant.id,
          name: tenant.name,
          subdomain: tenant.subdomain,
          language: tenant.language_default ?? tenant.language,
          country: tenant.country,
          currency: tenant.currency,
        },
        checkoutEnrolmentId,
      );
      if (enrolment.status === 'active' || enrolment.status === 'pending_waiver') return enrolment;
      if (attempts <= 0) return enrolment;
      await new Promise((r) => setTimeout(r, 1500));
      return poll(attempts - 1);
    };

    try {
      const enrolment = await poll();
      setCurrentStep('confirmation');
      if (enrolment) {
        setEnrolmentData(enrolment);
      }
      sessionStorage.setItem('portalEngagementId', checkoutEnrolmentId);
    } catch (error) {
      console.error('Failed to confirm enrolment after payment:', error);
      setCheckoutError(t('enrolment.payment_confirm_pending'));
    }
  };
}
