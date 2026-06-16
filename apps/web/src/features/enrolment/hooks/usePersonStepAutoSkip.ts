import { useEffect } from 'react';
import { EnrolmentOnboardingService } from '../onboardingService';
import { getStepAfterPerson } from '../lib/buildEnrolmentSteps';
import type { EnrolmentStep } from '../types/enrolmentStep';
import type { TenantConfig } from '@/types/auth';

interface EnrolmentContextSlice {
  isLoading: boolean;
  canSkipPersonStep: boolean;
  preselectedPersonId?: string | null;
  mode: string;
}

interface UsePersonStepAutoSkipParams {
  tenant: TenantConfig | null;
  enrolmentContext: EnrolmentContextSlice;
  userPersonId?: string | null;
  personId?: string;
  personStepSkipped: boolean;
  setPersonStepSkipped: (skipped: boolean) => void;
  currentStep: EnrolmentStep;
  setCurrentStep: (step: EnrolmentStep) => void;
  steps: EnrolmentStep[];
  onPersonLoaded: (personId: string, dateOfBirth: string | null) => void;
  /** When true, do not auto-advance past the person step (e.g. preselected class already enrolled). */
  blockAutoSkip?: boolean;
}

export function usePersonStepAutoSkip({
  tenant,
  enrolmentContext,
  userPersonId,
  personId,
  personStepSkipped,
  setPersonStepSkipped,
  currentStep,
  setCurrentStep,
  steps,
  onPersonLoaded,
  blockAutoSkip = false,
}: UsePersonStepAutoSkipParams) {
  useEffect(() => {
    if (blockAutoSkip || enrolmentContext.isLoading || personStepSkipped || !tenant) return;
    if (!enrolmentContext.canSkipPersonStep) return;

    const resolvedPersonId =
      enrolmentContext.preselectedPersonId ??
      (enrolmentContext.mode === 'adult_student' ? userPersonId : null);

    if (!resolvedPersonId || personId) return;

    let cancelled = false;
    void EnrolmentOnboardingService.getPerson(tenant, resolvedPersonId).then((person) => {
      if (cancelled) return;
      onPersonLoaded(person.id, person.date_of_birth ?? null);
      setPersonStepSkipped(true);
      if (currentStep === 'person') {
        const nextStep = getStepAfterPerson(steps);
        if (nextStep) {
          setCurrentStep(nextStep);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    enrolmentContext.isLoading,
    enrolmentContext.canSkipPersonStep,
    enrolmentContext.preselectedPersonId,
    enrolmentContext.mode,
    userPersonId,
    tenant,
    personStepSkipped,
    personId,
    currentStep,
    steps,
    setPersonStepSkipped,
    setCurrentStep,
    onPersonLoaded,
    blockAutoSkip,
  ]);
}
