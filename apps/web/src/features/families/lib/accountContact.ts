import type { Account, Person } from '@shared/schemas';

/** Guardian contact fields projected for admin UI (stored on people, not accounts). */
export type GuardianContactFields = {
  contact_person_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

export type AccountWithContact = Account & GuardianContactFields;

export function guardianContactFromPerson(
  person: Pick<Person, 'name' | 'email' | 'emergency_contact_phone'> | null | undefined,
): GuardianContactFields {
  return {
    contact_person_name: person?.name ?? null,
    contact_email: person?.email ?? null,
    contact_phone: person?.emergency_contact_phone ?? null,
  };
}

export function attachGuardianContact(
  account: Account,
  guardian: Pick<Person, 'name' | 'email' | 'emergency_contact_phone'> | null | undefined,
): AccountWithContact {
  return {
    ...account,
    ...guardianContactFromPerson(guardian),
  };
}
