import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Engagement } from '@shared/schemas';
import { buildEnrolmentSteps, getPreviousEnrolmentStep } from '../lib/buildEnrolmentSteps';
import type { EnrolmentStep } from '../types/enrolmentStep';

interface UseEnrolmentStepNavigationParams {
  initialStep?: EnrolmentStep;
  classPreselected: boolean;
  skipNotificationStep: boolean;
  showGuestVerifyStep: boolean;
  showWaiverStep: boolean;
  personStepSkipped: boolean;
  canSkipPersonStep: boolean;
  onCancel?: () => void;
}

export function useEnrolmentStepNavigation({
  initialStep = 'person',
  classPreselected,
  skipNotificationStep,
  showGuestVerifyStep,
  showWaiverStep,
  personStepSkipped,
  canSkipPersonStep,
  onCancel,
}: UseEnrolmentStepNavigationParams) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState<EnrolmentStep>(initialStep);

  const steps = useMemo(
    () =>
      buildEnrolmentSteps({
        classPreselected,
        skipNotificationStep,
        showGuestVerifyStep,
        showWaiverStep,
      }),
    [classPreselected, skipNotificationStep, showGuestVerifyStep, showWaiverStep],
  );

  const stepTitles: Record<EnrolmentStep, string> = {
    person: t('enrolment.step_person') || 'Personal details',
    class: t('enrolment.step_class') || 'Select Class',
    notification: t('enrolment.step_notification') || 'Notifications',
    verify_email: t('enrolment.step_verify_email') || 'Waiver Acknowledgment',
    waiver: t('enrolment.step_waiver') || 'Waiver',
    checkout: t('enrolment.step_checkout') || 'Payment',
    confirmation: t('enrolment.step_confirmation') || 'Confirmation',
  };

  const currentStepIndex = steps.indexOf(currentStep);
  const shouldSkipPersonStep = personStepSkipped || canSkipPersonStep;

  const getPreviousStep = useCallback(
    (fromIndex = currentStepIndex): EnrolmentStep | null =>
      getPreviousEnrolmentStep(steps, fromIndex, shouldSkipPersonStep),
    [steps, currentStepIndex, shouldSkipPersonStep],
  );

  const canGoBack = getPreviousStep() !== null;

  const goToNextStep = useCallback(() => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStep(steps[currentStepIndex + 1]);
    }
  }, [currentStepIndex, steps]);

  const handleNextStep = useCallback(
    (newData?: Partial<Engagement>, onData?: (data: Partial<Engagement>) => void) => {
      if (newData && onData) onData(newData);
      goToNextStep();
    },
    [goToNextStep],
  );

  const handlePreviousStep = useCallback(() => {
    const previous = getPreviousStep();
    if (previous) {
      setCurrentStep(previous);
    } else {
      onCancel?.();
    }
  }, [getPreviousStep, onCancel]);

  return {
    currentStep,
    setCurrentStep,
    steps,
    stepTitles,
    currentStepIndex,
    canGoBack,
    getPreviousStep,
    goToNextStep,
    handleNextStep,
    handlePreviousStep,
  };
}
