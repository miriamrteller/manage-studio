import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { FamilySchema, FamilyMemberSchema, type Family, type FamilyMember } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';

// Input schema for family creation — used only by EnrolmentOnboardingService.
export const FamilyInputSchema = z.object({
  name: z.string().min(1, 'Family name required').optional(),
  contact_person_name: z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
});

// Input schema for family member creation.
export const FamilyMemberInputSchema = z.object({
  family_id: z.string().uuid(),
  name: z.string().min(1, 'Name required'),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.enum(['parent', 'guardian', 'sibling', 'adult_student']),
});

export type FamilyContactUpdate = {
  contact_person_name?: string;
  contact_email?: string;
  contact_phone?: string;
};

const GUARDIAN_ROLES = new Set(['parent', 'guardian']);

/**
 * FamilyService: Family data operations.
 *
 * create() and delete() are intentionally NOT on the public surface used by the
 * admin UI. They are used only by EnrolmentOnboardingService during enrolment intake
 * so that a family row is always accompanied by at least one person and a family_member.
 *
 * Hard delete is never permitted (SPEC §D, migration 039). Use anonymise RPC (future).
 */
export class FamilyService extends BaseService {
  static async list(
    tenant: Tenant,
    options: { page?: number; pageSize?: number } = {}
  ) {
    const { page = 1, pageSize = 20 } = options;
    const from = (page - 1) * pageSize;

    return this.withRetry(async () => {
      const { data, error, count } = await TenantDB.selectFor('families', tenant, {
        count: 'exact',
      })
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      return {
        families: (data || []).map(f => FamilySchema.parse(f)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'FamilyService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('families', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Family not found');

      return FamilySchema.parse(data);
    }, 'FamilyService.get');
  }

  /** Get all people linked to a family (for detail view). */
  static async getPeople(tenant: Tenant, familyId: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('people', tenant)
        .eq('family_id', familyId);

      if (error) throw error;
      return data || [];
    }, 'FamilyService.getPeople');
  }

  /** Get all family_members for a family (for detail view). */
  static async getMembers(tenant: Tenant, familyId: string): Promise<FamilyMember[]> {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('family_members', tenant)
        .eq('family_id', familyId);

      if (error) throw error;
      return (data || []).map(m => FamilyMemberSchema.parse(m));
    }, 'FamilyService.getMembers');
  }

  /** Update contact details on an existing family (admin-safe edit). */
  static async update(tenant: Tenant, id: string, familyData: Partial<Family>) {
    const validated = FamilyInputSchema.parse(familyData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('families', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = FamilySchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'families', id);
      return result;
    }, 'FamilyService.update');
  }

  /**
   * Update family contact fields and keep guardian/parent family_members in sync.
   */
  static async updateContactWithGuardians(
    tenant: Tenant,
    familyId: string,
    contact: FamilyContactUpdate,
  ): Promise<Family> {
    const family = await this.update(tenant, familyId, contact);
    const members = await this.getMembers(tenant, familyId);
    const guardians = members.filter((m) => GUARDIAN_ROLES.has(m.role));

    const memberPatch: { name?: string; email?: string; phone?: string } = {};
    if (contact.contact_person_name !== undefined) {
      memberPatch.name = contact.contact_person_name;
    }
    if (contact.contact_email !== undefined) {
      memberPatch.email = contact.contact_email;
    }
    if (contact.contact_phone !== undefined) {
      memberPatch.phone = contact.contact_phone;
    }

    if (Object.keys(memberPatch).length === 0 || guardians.length === 0) {
      return family;
    }

    await this.withRetry(async () => {
      for (const member of guardians) {
        const { error } = await TenantDB.update('family_members', tenant, member.id, memberPatch);
        if (error) throw error;
        await this.logAudit(tenant, 'UPDATE', 'family_members', member.id);
      }
    }, 'FamilyService.updateContactWithGuardians');

    return family;
  }

  // -------------------------------------------------------------------------
  // Enrolment-only methods — called by EnrolmentOnboardingService, never by UI.
  // -------------------------------------------------------------------------

  /** @internal Used by EnrolmentOnboardingService only. */
  static async _createForEnrolment(tenant: Tenant, familyData: Partial<Family>) {
    const validated = FamilyInputSchema.parse(familyData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('families', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      const result = FamilySchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'families', result.id);
      return result;
    }, 'FamilyService._createForEnrolment');
  }

  /** @internal Used by EnrolmentOnboardingService only. */
  static async _createMemberForEnrolment(
    tenant: Tenant,
    memberData: z.infer<typeof FamilyMemberInputSchema>
  ): Promise<FamilyMember> {
    const validated = FamilyMemberInputSchema.parse(memberData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('family_members', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      return FamilyMemberSchema.parse(data);
    }, 'FamilyService._createMemberForEnrolment');
  }
}
