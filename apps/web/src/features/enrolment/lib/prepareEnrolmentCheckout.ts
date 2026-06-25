import type { Engagement } from '@shared/schemas';
import type { TFunction } from 'i18next';
import type { EnrolmentConstraints } from '../hooks/useEnrolmentContext';
import type { AgeOverrideState } from '../hooks/useAgeOverride';
import { isOfferingEnrolled } from './enrolled-offerings';

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
  enrolledOfferingKeys?: Set<string>;
  t: TFunction;
}

export interface PrepareEnrolmentCheckoutBlocked {
  kind: 'blocked';
  reason: 'missing_fields' | 'waiver_required' | 'ineligible_age' | 'already_enrolled';
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
    enrolledOfferingKeys,
  } = input;

  if (!personId || !offeringId || !seasonId) {
    return { kind: 'blocked', reason: 'missing_fields' };
  }

  if (isOfferingEnrolled(enrolledOfferingKeys, offeringId, seasonId)) {
    return {
      kind: 'blocked',
      reason: 'already_enrolled',
      errorMessage:
        mode === 'admin'
          ? t('pages.enrolment.already_enrolled_preselected_admin')
          : t('pages.enrolment.already_enrolled_preselected'),
    };
  }

  if (showWaiverStep && !waiverSignedInFlow) {
    return { kind: 'blocked', reason: 'waiver_required' };
  }

  if (
    classPreselected &&
    personDateOfBirth &&
    getSelectedClassAgeError(constraints, personDateOfBirth, t, {
      actor: mode === 'admin' ? 'admin' : mode === 'guest' ? 'guest' : 'parent',
      ageOverrideConfirmed: classAgeOverride.confirmed,
    })
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
        getSelectedClassAgeError(constraints, personDateOfBirth, t, {
          actor: 'admin',
          ageOverrideConfirmed: classAgeOverride.confirmed,
        }),
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
