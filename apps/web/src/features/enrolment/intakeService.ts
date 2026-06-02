import { supabase } from '@/lib/supabase';
import type { Tenant } from '@shared/schemas';

export interface GuestFamilyIntakeInput {
  guardian: {
    name: string;
    email: string;
    phone?: string;
  };
  student: {
    name: string;
    dateOfBirth: string;
    gender?: 'male' | 'female' | 'other';
  };
}

export interface GuestFamilyIntakeResult {
  accountId: string;
  guardianPersonId: string;
  studentPersonId: string;
  guardianEmail: string;
}

export interface GuestAdultIntakeInput {
  name: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
}

export interface GuestAdultIntakeResult {
  personId: string;
  email: string;
}

export interface GuestEngagementIntakeResult {
  engagementId: string;
}

function parseRpcError(error: { message?: string } | null, data: unknown): void {
  if (error?.message) {
    throw new Error(error.message);
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error));
  }
}

export class EnrolmentIntakeService {
  static async createGuestFamily(
    tenant: Tenant,
    input: GuestFamilyIntakeInput,
  ): Promise<GuestFamilyIntakeResult> {
    const { data, error } = await supabase.rpc('guest_enrolment_create_family', {
      p_subdomain: tenant.subdomain,
      p_guardian_name: input.guardian.name,
      p_guardian_email: input.guardian.email,
      p_guardian_phone: input.guardian.phone ?? '',
      p_student_name: input.student.name,
      p_student_dob: input.student.dateOfBirth,
    });

    parseRpcError(error, data);

    const row = data as Record<string, string>;
    return {
      accountId: row.accountId,
      guardianPersonId: row.guardianPersonId,
      studentPersonId: row.studentPersonId,
      guardianEmail: row.guardianEmail,
    };
  }

  static async createGuestAdult(
    tenant: Tenant,
    input: GuestAdultIntakeInput,
  ): Promise<GuestAdultIntakeResult> {
    const { data, error } = await supabase.rpc('guest_enrolment_create_adult', {
      p_subdomain: tenant.subdomain,
      p_name: input.name,
      p_email: input.email,
      p_phone: input.phone ?? '',
      p_date_of_birth: input.dateOfBirth ?? null,
    });

    parseRpcError(error, data);

    const row = data as Record<string, string>;
    return {
      personId: row.personId,
      email: row.email,
    };
  }

  static async createGuestEngagement(
    tenant: Tenant,
    input: { studentPersonId: string; offeringId: string; seasonId: string },
  ): Promise<GuestEngagementIntakeResult> {
    const { data, error } = await supabase.rpc('guest_enrolment_create_engagement', {
      p_subdomain: tenant.subdomain,
      p_student_person_id: input.studentPersonId,
      p_offering_id: input.offeringId,
      p_season_id: input.seasonId,
    });

    parseRpcError(error, data);

    const row = data as Record<string, string>;
    return { engagementId: row.engagementId };
  }
}
