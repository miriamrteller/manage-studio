import type { Engagement } from '@shared/schemas';
import type { TFunction } from 'i18next';
import type { EnrolmentConstraints } from '../hooks/useEnrolmentContext';
import type { AgeOverrideState } from '../hooks/useAgeOverride';

export interface PrepareEnrolmentCheckoutInput {
  tenant: { id: string };
  personId: string;
  offeringId: string;
  seasonId: string;
  mode: string;
  isGuestCheckout: boolean;
  classPreselected: boolean;
  personDateOfBirth: string | null;
  classAgeOverride: AgeOverrideState;
  waiverEvidenceId: string | null;
  constraints: EnrolmentConstraints;
  t: TFunction;
}

export interface PrepareEnrolmentCheckoutBlocked {
  kind: 'blocked';
  reason: 'missing_fields' | 'waiver_required' | 'ineligible_age';
  errorMessage?: string;
}

export interface PrepareEnrolmentCheckoutReady {
  kind: 'ready';
  isGuestCheckout: boolean;
  payload: Partial<Engagement>;
}

export type PrepareEnrolmentCheckoutResult =
  | PrepareEnrolmentCheckoutBlocked
  | PrepareEnrolmentCheckoutReady;

export function evaluateCheckoutPreparation(
  input: PrepareEnrolmentCheckoutInput & {
    showWaiverStep: boolean;
    waiverSignedInFlow: boolean;
    getSelectedClassAgeError: typeof import('../lib/selectedClassAgeValidation').getSelectedClassAgeError;
  },
): PrepareEnrolmentCheckoutResult {
  const {
    personId,
    offeringId,
    seasonId,
    showWaiverStep,
    waiverSignedInFlow,
    classPreselected,
    personDateOfBirth,
    classAgeOverride,
    constraints,
    t,
    getSelectedClassAgeError,
    isGuestCheckout,
    mode,
    waiverEvidenceId,
  } = input;

  if (!personId || !offeringId || !seasonId) {
    return { kind: 'blocked', reason: 'missing_fields' };
  }

  if (showWaiverStep && !waiverSignedInFlow) {
    return { kind: 'blocked', reason: 'waiver_required' };
  }

  if (
    classPreselected &&
    personDateOfBirth &&
    getSelectedClassAgeError(constraints, personDateOfBirth, t)
  ) {
    return {
      kind: 'blocked',
      reason: 'ineligible_age',
      errorMessage: t('pages.enrolment.ineligible_age'),
    };
  }

  const shouldApplyAgeOverride =
    mode === 'admin' &&
    classAgeOverride.confirmed &&
    Boolean(
      classPreselected &&
        personDateOfBirth &&
        getSelectedClassAgeError(constraints, personDateOfBirth, t),
    );

  return {
    kind: 'ready',
    isGuestCheckout,
    payload: {
      person_id: personId,
      offering_id: offeringId,
      season_id: seasonId,
      status: 'pending_payment',
      ...(shouldApplyAgeOverride
        ? {
            age_override_confirmed: true,
            age_override_reason: classAgeOverride.reason,
          }
        : {}),
      ...(waiverEvidenceId ? { waiver_evidence_id: waiverEvidenceId } : {}),
    },
  };
}
