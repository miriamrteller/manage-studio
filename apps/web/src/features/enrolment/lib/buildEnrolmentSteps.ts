import type { EnrolmentStep } from '../types/enrolmentStep';

export interface BuildEnrolmentStepsOptions {
  classPreselected: boolean;
  skipNotificationStep: boolean;
  showGuestVerifyStep: boolean;
  showWaiverStep: boolean;
}

export function buildEnrolmentSteps(options: BuildEnrolmentStepsOptions): EnrolmentStep[] {
  return [
    'person',
    options.classPreselected ? undefined : 'class',
    options.skipNotificationStep ? undefined : 'notification',
    options.showGuestVerifyStep ? 'verify_email' : undefined,
    options.showWaiverStep ? 'waiver' : undefined,
    'checkout',
    'confirmation',
  ].filter((s): s is EnrolmentStep => !!s);
}

export function getPreviousEnrolmentStep(
  steps: EnrolmentStep[],
  fromIndex: number,
  shouldSkipPersonStep: boolean,
): EnrolmentStep | null {
  let index = fromIndex - 1;
  while (index >= 0) {
    const step = steps[index];
    if (step === 'person' && shouldSkipPersonStep) {
      index -= 1;
      continue;
    }
    return step;
  }
  return null;
}

export function getStepAfterPerson(steps: EnrolmentStep[]): EnrolmentStep | null {
  const personIndex = steps.indexOf('person');
  if (personIndex >= 0 && personIndex < steps.length - 1) {
    return steps[personIndex + 1];
  }
  return null;
}
