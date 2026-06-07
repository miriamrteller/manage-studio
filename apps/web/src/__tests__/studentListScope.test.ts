import { describe, expect, it } from 'vitest';
import { mergeStudentListScopeIds } from '@/features/students/lib/resolveEnrolledPersonIds';
import { isStudentCandidate } from '@/features/enrolment/lib/filterStudentCandidates';
import type { Person } from '@shared/schemas';

const basePerson: Person = {
  id: '00000000-0000-0000-0000-000000000503',
  tenant_id: '00000000-0000-0000-0000-000000000001',
  user_profile_id: null,
  account_id: null,
  name: 'Sara Gold',
  email: 'sara.gold@gmail.com',
  date_of_birth: '1994-08-12',
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

describe('student list scope', () => {
  it('merges enrolled and solo student ids without duplicates', () => {
    const merged = mergeStudentListScopeIds(
      ['a', 'b'],
      ['b', 'c'],
    );
    expect(merged).toEqual(['a', 'b', 'c']);
  });

  it('treats adult solo students as candidates when includeAdultSolo is enabled', () => {
    expect(isStudentCandidate(basePerson, null, { includeAdultSolo: true })).toBe(true);
  });

  it('excludes guardians even when includeAdultSolo is enabled', () => {
    const guardianId = '00000000-0000-0000-0000-000000000504';
    expect(isStudentCandidate(basePerson, guardianId, { includeAdultSolo: true })).toBe(true);
    expect(
      isStudentCandidate(
        { ...basePerson, id: guardianId },
        guardianId,
        { includeAdultSolo: true },
      ),
    ).toBe(false);
  });
});
