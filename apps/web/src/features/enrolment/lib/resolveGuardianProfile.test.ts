import { describe, it, expect } from 'vitest';
import type { Person } from '@shared/schemas';
import {
  coalesceGuardianPersonId,
  collectPortalPersonIds,
  guardianProfileFromPerson,
} from './resolveGuardianProfile';

const person: Person = {
  id: '00000000-0000-0000-0000-000000000504',
  tenant_id: '00000000-0000-0000-0000-000000000001',
  user_profile_id: null,
  account_id: null,
  name: 'Miriam R Stern',
  email: 'parent@example.com',
  date_of_birth: '1988-03-15',
  medical_notes: null,
  allergies: null,
  emergency_contact_name: null,
  emergency_contact_phone: '0548421987',
  photo_consent: true,
  media_consent: true,
  status: 'active',
  waiver_accepted_at: null,
  waiver_version: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('coalesceGuardianPersonId', () => {
  it('prefers account member person id over user profile person id', () => {
    expect(coalesceGuardianPersonId('member-id', 'user-id')).toBe('member-id');
  });

  it('falls back to user profile person id when member is null', () => {
    expect(coalesceGuardianPersonId(null, 'user-id')).toBe('user-id');
  });

  it('returns null when both are missing', () => {
    expect(coalesceGuardianPersonId(undefined, null)).toBeNull();
  });
});

describe('guardianProfileFromPerson', () => {
  it('builds a guardian profile from a person row', () => {
    const profile = guardianProfileFromPerson(
      person,
      '00000000-0000-0000-0000-000000000401',
      '00000000-0000-0000-0000-000000000701',
      'fallback@example.com',
    );

    expect(profile).toEqual({
      personId: person.id,
      accountId: '00000000-0000-0000-0000-000000000401',
      accountMemberId: '00000000-0000-0000-0000-000000000701',
      name: person.name,
      email: person.email,
      phone: person.emergency_contact_phone,
      dateOfBirth: person.date_of_birth,
    });
  });
});

describe('collectPortalPersonIds', () => {
  it('includes guardian id when not already in children list', () => {
    expect(
      collectPortalPersonIds(
        [{ id: '00000000-0000-0000-0000-000000000501' }],
        '00000000-0000-0000-0000-000000000504',
      ),
    ).toEqual([
      '00000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000504',
    ]);
  });

  it('does not duplicate guardian id when already listed', () => {
    expect(
      collectPortalPersonIds(
        [{ id: '00000000-0000-0000-0000-000000000504' }],
        '00000000-0000-0000-0000-000000000504',
      ),
    ).toEqual(['00000000-0000-0000-0000-000000000504']);
  });
});
