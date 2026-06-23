import { describe, expect, it } from 'vitest';
import {
  resolveEnrolmentWaiverGateFromRows,
  type EnrolmentWaiverGateInput,
} from '../../../../supabase/functions/_shared/enrolment-waiver-gate.ts';

const BASE: EnrolmentWaiverGateInput = {
  offeringWaiverRequired: false,
  personName: 'Test Student',
  personDateOfBirth: '2015-01-01',
  engagementEvidenceId: null,
  evidenceValidForEnrolment: false,
  recentSignedEvidenceId: null,
  template: null,
};

describe('resolveEnrolmentWaiverGateFromRows', () => {
  it('returns not required when offering has no waiver', () => {
    const result = resolveEnrolmentWaiverGateFromRows(BASE);
    expect(result.required).toBe(false);
    expect(result.alreadySigned).toBe(false);
    expect(result.isMinorStudent).toBe(true);
    expect(result.studentName).toBe('Test Student');
  });

  it('returns unsigned when waiver required and no evidence', () => {
    const result = resolveEnrolmentWaiverGateFromRows({
      ...BASE,
      offeringWaiverRequired: true,
      template: { id: 'tmpl-1', version: 1, name: 'Waiver', content: 'x' },
    });
    expect(result.required).toBe(true);
    expect(result.alreadySigned).toBe(false);
    expect(result.template?.id).toBe('tmpl-1');
  });

  it('treats linked engagement evidence as signed', () => {
    const result = resolveEnrolmentWaiverGateFromRows({
      ...BASE,
      offeringWaiverRequired: true,
      engagementEvidenceId: 'ev-1',
      evidenceValidForEnrolment: true,
      template: { id: 'tmpl-1', version: 1, name: 'Waiver', content: 'x' },
    });
    expect(result.alreadySigned).toBe(true);
    expect(result.evidenceId).toBe('ev-1');
  });

  it('treats recent signed evidence as signed (authenticated pay parity)', () => {
    const result = resolveEnrolmentWaiverGateFromRows({
      ...BASE,
      offeringWaiverRequired: true,
      recentSignedEvidenceId: 'ev-recent',
      template: { id: 'tmpl-1', version: 1, name: 'Waiver', content: 'x' },
    });
    expect(result.alreadySigned).toBe(true);
    expect(result.evidenceId).toBe('ev-recent');
  });

  it('prefers linked engagement evidence over recent evidence', () => {
    const result = resolveEnrolmentWaiverGateFromRows({
      ...BASE,
      offeringWaiverRequired: true,
      engagementEvidenceId: 'ev-linked',
      evidenceValidForEnrolment: true,
      recentSignedEvidenceId: 'ev-recent',
      template: { id: 'tmpl-1', version: 1, name: 'Waiver', content: 'x' },
    });
    expect(result.evidenceId).toBe('ev-linked');
  });
});
