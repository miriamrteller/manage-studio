import { describe, it, expect, vi } from 'vitest';
import {
  buildEnrolmentSteps,
  getPreviousEnrolmentStep,
  getStepAfterPerson,
} from '@/features/enrolment/lib/buildEnrolmentSteps';
import { evaluateCheckoutPreparation } from '@/features/enrolment/lib/prepareEnrolmentCheckout';

describe('buildEnrolmentSteps', () => {
  it('includes all steps for full parent flow with waiver', () => {
    expect(
      buildEnrolmentSteps({
        classPreselected: false,
        skipNotificationStep: false,
        showGuestVerifyStep: false,
        showWaiverStep: true,
      }),
    ).toEqual(['person', 'class', 'notification', 'waiver', 'checkout', 'confirmation']);
  });

  it('skips class and notification when preselected and skipNotificationStep', () => {
    expect(
      buildEnrolmentSteps({
        classPreselected: true,
        skipNotificationStep: true,
        showGuestVerifyStep: false,
        showWaiverStep: false,
      }),
    ).toEqual(['person', 'checkout', 'confirmation']);
  });

  it('includes verify_email when guest verify step is enabled', () => {
    expect(
      buildEnrolmentSteps({
        classPreselected: false,
        skipNotificationStep: false,
        showGuestVerifyStep: true,
        showWaiverStep: false,
      }),
    ).toEqual(['person', 'class', 'notification', 'verify_email', 'checkout', 'confirmation']);
  });
});

describe('getPreviousEnrolmentStep', () => {
  const steps = ['person', 'class', 'waiver', 'checkout', 'confirmation'] as const;

  it('returns the immediate previous step', () => {
    expect(getPreviousEnrolmentStep([...steps], 3, false)).toBe('waiver');
  });

  it('skips person when shouldSkipPersonStep is true', () => {
    expect(getPreviousEnrolmentStep([...steps], 1, true)).toBeNull();
  });
});

describe('getStepAfterPerson', () => {
  it('returns the step following person', () => {
    expect(getStepAfterPerson(['person', 'class', 'checkout'])).toBe('class');
  });

  it('returns null when person is last', () => {
    expect(getStepAfterPerson(['person'])).toBeNull();
  });
});

describe('evaluateCheckoutPreparation', () => {
  const baseInput = {
    tenant: { id: 'tenant-1' },
    personId: 'person-1',
    offeringId: 'offering-1',
    seasonId: 'season-1',
    mode: 'parent',
    isGuestCheckout: false,
    classPreselected: false,
    personDateOfBirth: null,
    classAgeOverride: { confirmed: false, reason: '' },
    waiverEvidenceId: null,
    constraints: {},
    t: (key: string) => key,
    showWaiverStep: false,
    waiverSignedInFlow: false,
    getSelectedClassAgeError: () => null,
  };

  it('blocks when required fields are missing', () => {
    expect(
      evaluateCheckoutPreparation({
        ...baseInput,
        personId: '',
      }),
    ).toEqual({ kind: 'blocked', reason: 'missing_fields' });
  });

  it('blocks checkout when waiver is required but not signed', () => {
    expect(
      evaluateCheckoutPreparation({
        ...baseInput,
        showWaiverStep: true,
        waiverSignedInFlow: false,
      }),
    ).toEqual({ kind: 'blocked', reason: 'waiver_required' });
  });

  it('returns ready payload when waiver was signed in flow', () => {
    const result = evaluateCheckoutPreparation({
      ...baseInput,
      showWaiverStep: true,
      waiverSignedInFlow: true,
      waiverEvidenceId: 'evidence-1',
    });

    expect(result).toMatchObject({
      kind: 'ready',
      isGuestCheckout: false,
      payload: {
        status: 'pending_payment',
        waiver_evidence_id: 'evidence-1',
      },
    });
  });

  it('blocks ineligible age for preselected class', () => {
    const getSelectedClassAgeError = vi.fn(() => 'Too old');
    expect(
      evaluateCheckoutPreparation({
        ...baseInput,
        classPreselected: true,
        personDateOfBirth: '2010-01-01',
        getSelectedClassAgeError,
      }),
    ).toEqual({
      kind: 'blocked',
      reason: 'ineligible_age',
      errorMessage: 'pages.enrolment.ineligible_age',
    });
  });

  it('marks guest checkout as ready', () => {
    expect(
      evaluateCheckoutPreparation({
        ...baseInput,
        mode: 'guest',
        isGuestCheckout: true,
      }),
    ).toMatchObject({
      kind: 'ready',
      isGuestCheckout: true,
    });
  });
});
