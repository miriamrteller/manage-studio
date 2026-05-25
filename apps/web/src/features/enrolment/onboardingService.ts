import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { PersonSchema, FamilySchema, FamilyMemberSchema, type Person, type Family, type FamilyMember } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';
import { FamilyInputSchema } from '@/features/families/service';

// Input for a new minor enrolment — creates family + family_member + person in sequence.
export const NewMinorOnboardingInputSchema = z.object({
  // Student fields
  student_name: z.string().min(1, 'Student name required'),
  student_date_of_birth: z.string().date('Invalid date format'),
  student_gender: z.enum(['male', 'female', 'other']).optional(),

  // Guardian / contact fields (becomes the family contact and family_member row)
  guardian_name: z.string().min(1, 'Guardian name required'),
  guardian_email: z.string().email('Invalid email').optional(),
  guardian_phone: z.string().optional(),
  guardian_role: z.enum(['parent', 'guardian']).default('parent'),
});

export type NewMinorOnboardingInput = z.infer<typeof NewMinorOnboardingInputSchema>;

// Input for a new adult solo enrolment — creates person only.
export const NewAdultOnboardingInputSchema = z.object({
  name: z.string().min(1, 'Name required'),
  email: z.string().email('Invalid email').optional(),
  date_of_birth: z.string().date('Invalid date format').optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
});

export type NewAdultOnboardingInput = z.infer<typeof NewAdultOnboardingInputSchema>;

export interface MinorOnboardingResult {
  family: Family;
  person: Person;
  member: FamilyMember;
}

export interface AdultOnboardingResult {
  person: Person;
}

/**
 * EnrolmentOnboardingService
 *
 * The ONLY place where families are created in this application.
 * Called from EnrolmentStepper Step 1; never exposed to the admin Families UI.
 *
 * Each method is a mini-transaction: if any step fails the enrolment intake
 * should surface the error to the user and allow a retry (DB writes are
 * idempotent via ON CONFLICT DO NOTHING at the RLS layer; the family row
 * may need a compensating cleanup in a future migration if required).
 */
export class EnrolmentOnboardingService extends BaseService {
  /**
   * Lookup an existing person by email (for returning customers).
   * Returns null if not found.
   */
  static async findPersonByEmail(tenant: Tenant, email: string): Promise<Person | null> {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('people', tenant)
        .eq('email', email)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return PersonSchema.parse(data);
    }, 'EnrolmentOnboardingService.findPersonByEmail');
  }

  /**
   * Create a new minor student with their family and guardian record.
   * Order: family → person (with family_id) → family_member.
   */
  static async createMinorWithFamily(
    tenant: Tenant,
    input: NewMinorOnboardingInput
  ): Promise<MinorOnboardingResult> {
    const validated = NewMinorOnboardingInputSchema.parse(input);

    // 1. Create family
    const familyPayload: z.infer<typeof FamilyInputSchema> = {
      name: `${validated.guardian_name} family`,
      contact_person_name: validated.guardian_name,
      contact_email: validated.guardian_email,
      contact_phone: validated.guardian_phone,
    };
    const { data: familyData, error: familyError } = await TenantDB.insert(
      'families',
      tenant,
      familyPayload
    )
      .select()
      .single();
    if (familyError) throw new Error(`Failed to create family: ${familyError.message}`);
    const family = FamilySchema.parse(familyData);
    await this.logAudit(tenant, 'CREATE', 'families', family.id);

    // 2. Create student person linked to family
    const personPayload = {
      name: validated.student_name,
      date_of_birth: validated.student_date_of_birth,
      gender: validated.student_gender,
      family_id: family.id,
      status: 'active' as const,
    };
    const { data: personData, error: personError } = await TenantDB.insert(
      'people',
      tenant,
      personPayload
    )
      .select()
      .single();
    if (personError) throw new Error(`Failed to create student: ${personError.message}`);
    const person = PersonSchema.parse(personData);
    await this.logAudit(tenant, 'CREATE', 'people', person.id);

    // 3. Create family_member for guardian
    const memberPayload = {
      family_id: family.id,
      name: validated.guardian_name,
      email: validated.guardian_email,
      phone: validated.guardian_phone,
      role: validated.guardian_role,
    };
    const { data: memberData, error: memberError } = await TenantDB.insert(
      'family_members',
      tenant,
      memberPayload
    )
      .select()
      .single();
    if (memberError) throw new Error(`Failed to create guardian record: ${memberError.message}`);
    const member = FamilyMemberSchema.parse(memberData);
    await this.logAudit(tenant, 'CREATE', 'family_members', member.id);

    return { family, person, member };
  }

  /**
   * Create a new adult solo student (no family required).
   */
  static async createAdultSolo(
    tenant: Tenant,
    input: NewAdultOnboardingInput
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
