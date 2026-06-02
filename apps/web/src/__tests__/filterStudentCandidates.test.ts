import { describe, it, expect } from 'vitest';
import type { Person } from '@shared/schemas';
import {
  filterStudentCandidates,
  isStudentCandidate,
} from '@/features/enrolment/lib/filterStudentCandidates';

const child: Person = {
  id: '00000000-0000-0000-0000-000000000501',
  tenant_id: '00000000-0000-0000-0000-000000000001',
  user_profile_id: null,
  account_id: '00000000-0000-0000-0000-000000000401',
  name: 'Miriam Stern',
  email: null,
  date_of_birth: '2022-05-15',
  medical_notes: null,
  allergies: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  photo_consent: true,
  media_consent: true,
  status: 'active',
  waiver_accepted_at: null,
  waiver_version: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const guardian: Person = {
  ...child,
  id: '00000000-0000-0000-0000-000000000504',
  account_id: null,
  name: 'Guardian',
  date_of_birth: '1988-03-15',
};

describe('filterStudentCandidates', () => {
  it('includes account children and excludes guardian person row', () => {
    expect(isStudentCandidate(child, guardian.id)).toBe(true);
    expect(isStudentCandidate(guardian, guardian.id)).toBe(false);
  });

  it('filters by account id', () => {
    const otherAccountChild = { ...child, id: 'x', account_id: 'other' };
    const { eligible, ineligible } = filterStudentCandidates(
      [child, otherAccountChild],
      { accountId: child.account_id ?? undefined },
      guardian.id,
    );
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe(child.id);
    expect(ineligible).toHaveLength(1);
    expect(ineligible[0].reason).toBe('account');
  });

  it('filters by class age band', () => {
    const { eligible } = filterStudentCandidates(
      [child],
      { ageBand: { min_age: 3, max_age: 4 } },
      guardian.id,
    );
    expect(eligible).toHaveLength(1);

    const tooOld = { ...child, date_of_birth: '2010-01-01' };
    const result = filterStudentCandidates(
      [tooOld],
      { ageBand: { min_age: 3, max_age: 4 } },
      guardian.id,
    );
    expect(result.eligible).toHaveLength(0);
    expect(result.ineligible[0].reason).toBe('age');
  });
});
