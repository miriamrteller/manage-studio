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
  enrolmentToken: string;
}

export class ExistingEmailError extends Error {
  constructor() {
    super('EXISTING_EMAIL');
    this.name = 'ExistingEmailError';
  }
}

export function isExistingEmailError(error: unknown): error is ExistingEmailError {
  if (error instanceof ExistingEmailError) return true;
  if (error instanceof Error) {
    return (
      error.message.includes('EXISTING_EMAIL') ||
      error.message.includes('people_tenant_id_email_key')
    );
  }
  return false;
}

function parseRpcError(error: { message?: string } | null, data: unknown): void {
  const message = error?.message ?? '';
  if (
    message.includes('EXISTING_EMAIL') ||
    message.includes('people_tenant_id_email_key')
  ) {
    throw new ExistingEmailError();
  }
  if (error?.message) {
    throw new Error(error.message);
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error));
  }
}

export class EnrolmentIntakeService {
  static async checkGuestEmailRegistered(tenant: Tenant, email: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('guest_enrolment_check_email', {
      p_subdomain: tenant.subdomain,
      p_email: email.trim().toLowerCase(),
    });

    parseRpcError(error, data);

    const row = data as { registered?: boolean } | null;
    return Boolean(row?.registered);
  }

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
    const { data, error } = await supabase.functions.invoke('create-enrolment-intake', {
      body: {
        action: 'create_engagement',
        tenantSubdomain: tenant.subdomain,
        studentPersonId: input.studentPersonId,
        offeringId: input.offeringId,
        seasonId: input.seasonId,
      },
    });

    parseRpcError(error, data);

    const row = data as Record<string, string | undefined>;
    const engagementId = row.engagementId ?? row.engagement_id;
    const enrolmentToken = row.enrolmentToken ?? row.enrolment_token;
    if (!engagementId || !enrolmentToken) {
      throw new Error('Failed to create engagement token');
    }
    return { engagementId, enrolmentToken };
  }
}
