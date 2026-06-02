import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import {
  PersonSchema,
  AccountSchema,
  AccountMemberSchema,
  type Person,
  type Account,
  type AccountMember,
} from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';

export const NewMinorOnboardingInputSchema = z.object({
  student_name: z.string().min(1, 'Student name required'),
  student_date_of_birth: z.string().date('Invalid date format'),
  student_gender: z.enum(['male', 'female', 'other']).optional(),
  guardian_name: z.string().min(1, 'Guardian name required'),
  guardian_email: z.string().email('Invalid email').optional(),
  guardian_phone: z.string().optional(),
  guardian_role: z.enum(['account_holder', 'member']).default('account_holder'),
  user_profile_id: z.string().uuid().optional(),
});

export type NewMinorOnboardingInput = z.infer<typeof NewMinorOnboardingInputSchema>;

export const NewChildForAccountInputSchema = z.object({
  student_name: z.string().min(1, 'Student name required'),
  student_date_of_birth: z.string().date('Invalid date format'),
  student_gender: z.enum(['male', 'female', 'other']).optional(),
});

export type NewChildForAccountInput = z.infer<typeof NewChildForAccountInputSchema>;

export const NewAdultOnboardingInputSchema = z.object({
  name: z.string().min(1, 'Name required'),
  email: z.string().email('Invalid email').optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
});

export type NewAdultOnboardingInput = z.infer<typeof NewAdultOnboardingInputSchema>;

export interface MinorOnboardingResult {
  family: Account;
  person: Person;
  member: AccountMember;
  guardian: Person;
}

export interface AdultOnboardingResult {
  person: Person;
}

export interface GuardianProfile {
  personId: string;
  accountId: string;
  name: string;
  email: string | null;
  phone: string | null;
}

/**
 * EnrolmentOnboardingService — the only place accounts are created during intake.
 */
export interface GuardianAccountLookup {
  accountId: string;
  guardianPersonId: string;
  guardianName: string;
  guardianEmail: string | null;
}

export class EnrolmentOnboardingService extends BaseService {
  /** Resolve the logged-in parent's single account. Throws if zero or multiple. */
  static async getParentAccountId(userProfileId: string): Promise<string> {
    const { data, error } = await supabase
      .from('account_members')
      .select('account_id, role')
      .eq('user_profile_id', userProfileId);

    if (error) throw new Error(`Failed to load account: ${error.message}`);

    const rows = data ?? [];
    const accountIds = [...new Set(rows.map((row) => row.account_id))];
    if (accountIds.length === 0) {
      throw new Error('No family account linked to this login.');
    }
    if (accountIds.length > 1) {
      const primary = rows.find((row) => row.role === 'account_holder');
      if (primary) {
        return primary.account_id;
      }
      throw new Error('Multiple family accounts linked to this login. Please contact the studio.');
    }
    return accountIds[0];
  }

  /** Load guardian contact details for a parent login. */
  static async getGuardianProfile(
    tenant: Tenant,
    userProfileId: string,
    userEmail: string | null | undefined,
  ): Promise<GuardianProfile> {
    const accountId = await this.getParentAccountId(userProfileId);

    const { data: memberRows, error: memberError } = await TenantDB.selectFor('account_members', tenant)
      .eq('account_id', accountId)
      .eq('user_profile_id', userProfileId)
      .limit(1);

    if (memberError) throw memberError;

    const member = memberRows?.[0];
    if (!member) {
      throw new Error('Guardian membership not found.');
    }

    const guardian = await this.getPerson(tenant, member.person_id as string);
    return {
      personId: guardian.id,
      accountId,
      name: guardian.name,
      email: guardian.email ?? userEmail ?? null,
      phone: guardian.emergency_contact_phone ?? null,
    };
  }

  static async getPerson(tenant: Tenant, personId: string): Promise<Person> {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('people', tenant)
        .eq('id', personId)
        .single();
      if (error) throw error;
      return PersonSchema.parse(data);
    }, 'EnrolmentOnboardingService.getPerson');
  }

  static async createChildForAccount(
    tenant: Tenant,
    accountId: string,
    input: NewChildForAccountInput,
  ): Promise<Person> {
    const validated = NewChildForAccountInputSchema.parse(input);

    const personPayload = {
      name: validated.student_name,
      date_of_birth: validated.student_date_of_birth,
      gender: validated.student_gender,
      account_id: accountId,
      status: 'active' as const,
    };

    const { data: personData, error: personError } = await TenantDB.insert('people', tenant, personPayload)
      .select()
      .single();
    if (personError) throw new Error(`Failed to create student: ${personError.message}`);
    const person = PersonSchema.parse(personData);
    await this.logAudit(tenant, 'CREATE', 'people', person.id);
    return person;
  }

  /** Admin: resolve guardian + family account by email (null if not found). */
  static async lookupGuardianAccountByEmail(
    _tenant: Tenant,
    email: string,
  ): Promise<GuardianAccountLookup | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;

    const { data, error } = await supabase.rpc('admin_enrolment_lookup_email', {
      p_email: normalized,
    });

    if (error) throw new Error(error.message);

    const row = data as {
      found?: boolean;
      accountId?: string;
      guardianPersonId?: string;
      guardianName?: string;
      guardianEmail?: string;
    };

    if (!row?.found || !row.accountId || !row.guardianPersonId) {
      return null;
    }

    return {
      accountId: row.accountId,
      guardianPersonId: row.guardianPersonId,
      guardianName: row.guardianName ?? '',
      guardianEmail: row.guardianEmail ?? null,
    };
  }

  /**
   * Admin intake: add student to existing family when guardian email is known,
   * otherwise create a new family record.
   */
  static async createStudentWithGuardianEmail(
    tenant: Tenant,
    input: NewMinorOnboardingInput,
  ): Promise<Person> {
    const validated = NewMinorOnboardingInputSchema.parse(input);

    if (validated.guardian_email) {
      const existing = await this.lookupGuardianAccountByEmail(tenant, validated.guardian_email);
      if (existing) {
        return this.createChildForAccount(tenant, existing.accountId, {
          student_name: validated.student_name,
          student_date_of_birth: validated.student_date_of_birth,
          student_gender: validated.student_gender,
        });
      }
    }

    const { person } = await this.createMinorWithFamily(tenant, validated);
    return person;
  }

  /**
   * Full minor intake: guardian person → account → student → account_member.
   */
  static async createMinorWithFamily(
    tenant: Tenant,
    input: NewMinorOnboardingInput,
  ): Promise<MinorOnboardingResult> {
    const validated = NewMinorOnboardingInputSchema.parse(input);

    const guardianPayload = {
      name: validated.guardian_name,
      email: validated.guardian_email ?? null,
      emergency_contact_phone: validated.guardian_phone ?? null,
      status: 'active' as const,
    };
    const { data: guardianData, error: guardianError } = await TenantDB.insert('people', tenant, guardianPayload)
      .select()
      .single();
    if (guardianError) throw new Error(`Failed to create guardian: ${guardianError.message}`);
    const guardian = PersonSchema.parse(guardianData);
    await this.logAudit(tenant, 'CREATE', 'people', guardian.id);

    const familyPayload = {
      name: `${validated.guardian_name} family`,
      person_id: guardian.id,
    };
    const { data: familyData, error: familyError } = await TenantDB.insert('accounts', tenant, familyPayload)
      .select()
      .single();
    if (familyError) throw new Error(`Failed to create family: ${familyError.message}`);
    const family = AccountSchema.parse(familyData);
    await this.logAudit(tenant, 'CREATE', 'accounts', family.id);

    const studentPayload = {
      name: validated.student_name,
      date_of_birth: validated.student_date_of_birth,
      gender: validated.student_gender,
      account_id: family.id,
      status: 'active' as const,
    };
    const { data: personData, error: personError } = await TenantDB.insert('people', tenant, studentPayload)
      .select()
      .single();
    if (personError) throw new Error(`Failed to create student: ${personError.message}`);
    const person = PersonSchema.parse(personData);
    await this.logAudit(tenant, 'CREATE', 'people', person.id);

    const memberPayload = {
      account_id: family.id,
      person_id: guardian.id,
      role: validated.guardian_role,
      user_profile_id: validated.user_profile_id ?? null,
    };
    const { data: memberData, error: memberError } = await TenantDB.insert(
      'account_members',
      tenant,
      memberPayload,
    )
      .select()
      .single();
    if (memberError) throw new Error(`Failed to create guardian record: ${memberError.message}`);
    const member = AccountMemberSchema.parse(memberData);
    await this.logAudit(tenant, 'CREATE', 'account_members', member.id);

    return { family, person, member, guardian };
  }

  static async createAdultSolo(
    tenant: Tenant,
    input: NewAdultOnboardingInput,
  ): Promise<AdultOnboardingResult> {
    const validated = NewAdultOnboardingInputSchema.parse(input);

    const { data, error } = await TenantDB.insert('people', tenant, {
      ...validated,
      status: 'active' as const,
    })
      .select()
      .single();

    if (error) throw new Error(`Failed to create person: ${error.message}`);
    const person = PersonSchema.parse(data);
    await this.logAudit(tenant, 'CREATE', 'people', person.id);
    return { person };
  }
}
