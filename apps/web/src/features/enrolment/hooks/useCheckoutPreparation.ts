import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { TFunction } from 'i18next';
import type { Engagement } from '@shared/schemas';
import { EnrolmentIntakeService } from '../intakeService';
import { getSelectedClassAgeError } from '../lib/selectedClassAgeValidation';
import type { EnrolmentConstraints } from '../hooks/useEnrolmentContext';
import { evaluateCheckoutPreparation } from '../lib/prepareEnrolmentCheckout';
import { mapEnrolmentFlowError } from '../lib/mapEnrolmentFlowError';
import { fetchCheckoutBootstrap } from '../lib/fetchCheckoutBootstrap';
import type { CheckoutChargePayload } from '../lib/checkoutBootstrapTypes';
import type { AgeOverrideState } from './useAgeOverride';
import type { EnrolmentStep } from '../types/enrolmentStep';
import type { TenantConfig } from '@/types/auth';

export interface UseCheckoutPreparationParams {
  currentStep: EnrolmentStep;
  setCurrentStep: (step: EnrolmentStep) => void;
  tenant: TenantConfig | null;
  personId?: string;
  offeringId?: string;
  seasonId?: string | null;
  setEnrolmentData: Dispatch<SetStateAction<Partial<Engagement>>>;
  mode: string;
  user: { id: string } | null;
  classPreselected: boolean;
  personDateOfBirth: string | null;
  classAgeOverride: AgeOverrideState;
  constraints: EnrolmentConstraints;
  showWaiverStep: boolean;
  waiverSignedInFlow: boolean;
  waiverEvidenceId: string | null;
  enrolledOfferingKeys?: Set<string>;
  navigate: NavigateFunction;
  t: TFunction;
}

const checkoutPrepareInflight = new Map<
  string,
  Promise<{ engagementId: string; charge: CheckoutChargePayload }>
>();

function prepareKey(
  tenantId: string,
  personId: string,
  offeringId: string,
  seasonId: string,
): string {
  return `${tenantId}:${personId}:${offeringId}:${seasonId}`;
}

export function useCheckoutPreparation({
  currentStep,
  setCurrentStep,
  tenant,
  personId,
  offeringId,
  seasonId,
  setEnrolmentData,
  mode,
  user,
  classPreselected,
  personDateOfBirth,
  classAgeOverride,
  constraints,
  showWaiverStep,
  waiverSignedInFlow,
  waiverEvidenceId,
  enrolledOfferingKeys,
  navigate,
  t,
}: UseCheckoutPreparationParams) {
  const [checkoutEnrolmentId, setCheckoutEnrolmentId] = useState<string | null>(null);
  const [checkoutCharge, setCheckoutCharge] = useState<CheckoutChargePayload | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isCheckoutPreparing, setIsCheckoutPreparing] = useState(false);
  const checkoutPrepareStartedRef = useRef(false);

  const resetCheckoutState = () => {
    setCheckoutEnrolmentId(null);
    setCheckoutCharge(null);
    setCheckoutError(null);
    setIsCheckoutPreparing(false);
    checkoutPrepareStartedRef.current = false;
  };

  useEffect(() => {
    if (currentStep !== 'checkout') {
      checkoutPrepareStartedRef.current = false;
      return;
    }
    if (checkoutEnrolmentId) return;
    if (checkoutPrepareStartedRef.current) return;
    if (!tenant) return;

    const evaluation = evaluateCheckoutPreparation({
      tenant,
      personId: personId ?? '',
      offeringId: offeringId ?? '',
      seasonId: seasonId ?? '',
      mode,
      isGuestCheckout: mode === 'guest' || !user,
      classPreselected,
      personDateOfBirth,
      classAgeOverride,
      waiverEvidenceId,
      enrolledOfferingKeys,
      constraints,
      t,
      showWaiverStep,
      waiverSignedInFlow,
      getSelectedClassAgeError,
    });

    if (evaluation.kind === 'blocked') {
      if (evaluation.reason === 'waiver_required') {
        setCurrentStep('waiver');
      } else if (
        (evaluation.reason === 'ineligible_age' || evaluation.reason === 'already_enrolled') &&
        evaluation.errorMessage
      ) {
        setCheckoutError(evaluation.errorMessage);
      }
      return;
    }

    checkoutPrepareStartedRef.current = true;

    const prepareCheckout = async () => {
      setIsCheckoutPreparing(true);
      setCheckoutError(null);

      try {
        if (evaluation.isGuestCheckout) {
          const { engagementId, enrolmentToken } = await EnrolmentIntakeService.createGuestEngagement(
            tenant,
            {
              studentPersonId: personId!,
              offeringId: offeringId!,
              seasonId: seasonId!,
            },
          );
          setCheckoutEnrolmentId(engagementId);
          setEnrolmentData((prev) => ({ ...prev, id: engagementId, status: 'pending_payment' }));
          setIsCheckoutPreparing(false);
          navigate(
            `/enrol/pay/${encodeURIComponent(engagementId)}?t=${encodeURIComponent(enrolmentToken)}`,
            { replace: true },
          );
          return;
        }

        const key = prepareKey(tenant.id, personId!, offeringId!, seasonId!);
        let inflight = checkoutPrepareInflight.get(key);
        if (!inflight) {
          inflight = (async () => {
            const payload = evaluation.payload;
            const ageOverrideConfirmed =
              'age_override_confirmed' in payload && payload.age_override_confirmed === true;
            const result = await fetchCheckoutBootstrap({
              phase: 'pay',
              mode: 'create_engagement',
              person_id: personId!,
              offering_id: offeringId!,
              season_id: seasonId!,
              ...(payload.waiver_evidence_id
                ? { waiver_evidence_id: payload.waiver_evidence_id }
                : {}),
              ...(ageOverrideConfirmed
                ? {
                    age_override_confirmed: true,
                    age_override_reason:
                      'age_override_reason' in payload
                        ? (payload.age_override_reason as string | null)
                        : null,
                  }
                : {}),
            });

            if (result.blockReason === 'waiver_required') {
              throw new Error(t('enrolment.waiver_required_before_checkout', { defaultValue: 'Waiver required' }));
            }
            if (!result.charge) {
              throw new Error(t('enrolment.payment_setup_failed'));
            }

            return {
              engagementId: result.context.engagementId,
              charge: result.charge,
            };
          })();
          checkoutPrepareInflight.set(key, inflight);
          try {
            return await inflight;
          } finally {
            checkoutPrepareInflight.delete(key);
          }
        }

        const { engagementId, charge } = await inflight;
        setCheckoutEnrolmentId(engagementId);
        setCheckoutCharge(charge);
        setEnrolmentData((prev) => ({
          ...prev,
          id: engagementId,
          person_id: personId,
          offering_id: offeringId,
          season_id: seasonId,
          status: 'pending_payment',
        }));
        setIsCheckoutPreparing(false);
      } catch (error) {
        checkoutPrepareStartedRef.current = false;
        setCheckoutError(mapEnrolmentFlowError(error, t, mode));
        setIsCheckoutPreparing(false);
      }
    };

    void prepareCheckout();
  }, [
    currentStep,
    checkoutEnrolmentId,
    tenant,
    personId,
    offeringId,
    seasonId,
    mode,
    user,
    classPreselected,
    personDateOfBirth,
    classAgeOverride,
    constraints,
    showWaiverStep,
    waiverSignedInFlow,
    waiverEvidenceId,
    enrolledOfferingKeys,
    navigate,
    t,
    setCurrentStep,
    setEnrolmentData,
  ]);

  return {
    checkoutEnrolmentId,
    checkoutCharge,
    checkoutError,
    isCheckoutPreparing,
    resetCheckoutState,
    setCheckoutError,
  };
}
