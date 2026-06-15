import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { TFunction } from 'i18next';
import type { Engagement } from '@shared/schemas';
import { EnrolmentIntakeService } from '../intakeService';
import { getSelectedClassAgeError } from '../lib/selectedClassAgeValidation';
import type { EnrolmentConstraints } from '../hooks/useEnrolmentContext';
import { evaluateCheckoutPreparation } from '../lib/prepareEnrolmentCheckout';
import type { AgeOverrideState } from './useAgeOverride';
import type { EnrolmentStep } from '../types/enrolmentStep';
import type { TenantConfig } from '@/types/auth';

interface CreateEnrolmentFn {
  (
    data: Partial<Engagement>,
    options: {
      onSuccess: (created: Engagement) => void;
      onError: () => void;
    },
  ): void;
}

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
  createEnrolment: CreateEnrolmentFn;
  navigate: NavigateFunction;
  t: TFunction;
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
  createEnrolment,
  navigate,
  t,
}: UseCheckoutPreparationParams) {
  const [checkoutEnrolmentId, setCheckoutEnrolmentId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isCheckoutPreparing, setIsCheckoutPreparing] = useState(false);
  const checkoutPrepareStartedRef = useRef(false);

  const resetCheckoutState = () => {
    setCheckoutEnrolmentId(null);
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
      constraints,
      t,
      showWaiverStep,
      waiverSignedInFlow,
      getSelectedClassAgeError,
    });

    if (evaluation.kind === 'blocked') {
      if (evaluation.reason === 'waiver_required') {
        setCurrentStep('waiver');
      } else if (evaluation.reason === 'ineligible_age' && evaluation.errorMessage) {
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

        createEnrolment(evaluation.payload, {
          onSuccess: (created) => {
            setCheckoutEnrolmentId(created.id);
            setEnrolmentData(created);
            setIsCheckoutPreparing(false);
          },
          onError: () => {
            checkoutPrepareStartedRef.current = false;
            setCheckoutError(t('enrolment.checkout_prepare_failed'));
            setIsCheckoutPreparing(false);
          },
        });
      } catch (error) {
        checkoutPrepareStartedRef.current = false;
        setCheckoutError(
          error instanceof Error ? error.message : t('enrolment.checkout_prepare_failed'),
        );
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
    createEnrolment,
    navigate,
    t,
    setCurrentStep,
    setEnrolmentData,
  ]);

  return {
    checkoutEnrolmentId,
    checkoutError,
    isCheckoutPreparing,
    resetCheckoutState,
    setCheckoutError,
  };
}
