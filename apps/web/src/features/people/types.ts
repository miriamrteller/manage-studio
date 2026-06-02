import type { Person } from '@shared/schemas';

/** Rich person row returned by search_enrolment_students (admin people search). */
export interface PersonSearchResult {
  person: Person;
  accountName: string | null;
  guardianName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  activeClassNames: string[];
  /** True when this person is the account_holder for a family. */
  isAccountHolder?: boolean;
  /** Family account id (from person.account_id or account_members). */
  familyAccountId?: string | null;
}
