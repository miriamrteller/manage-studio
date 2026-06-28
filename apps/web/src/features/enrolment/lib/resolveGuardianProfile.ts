import { TenantDB } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { PersonSchema, type Person, type Tenant } from '@shared/schemas';
import type { GuardianProfile } from '../onboardingService';

async function writeMemberBackfillAudit(tenant: Tenant, accountMemberId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const actorId = userData.user?.id;
  if (!actorId) return;

  const { error } = await supabase.from('audit_log').insert({
    tenant_id: tenant.id,
    actor_id: actorId,
    action: 'UPDATE',
    entity_type: 'account_members',
    entity_id: accountMemberId,
  });

  if (error) {
    console.warn('[Audit] failed to write audit_log:', error.message);
  }
}

export const GUARDIAN_MEMBER_ROLES = ['account_holder', 'member'] as const;

export type ResolveGuardianProfileInput = {
  tenant: Tenant;
  userProfileId: string;
  userEmail: string | null | undefined;
  userPersonId: string | null | undefined;
};

export type ResolveGuardianProfileResult =
  | { status: 'found'; profile: GuardianProfile }
  | { status: 'missing_account'; error: Error }
  | { status: 'missing_person'; accountId: string; accountMemberId: string }
  | { status: 'error'; error: Error };

export function coalesceGuardianPersonId(
  memberPersonId: string | null | undefined,
  userPersonId: string | null | undefined,
): string | null {
  return memberPersonId ?? userPersonId ?? null;
}

export function guardianProfileFromPerson(
  person: Person,
  accountId: string,
  accountMemberId: string,
  userEmail: string | null | undefined,
): GuardianProfile {
  return {
    personId: person.id,
    accountId,
    accountMemberId,
    name: person.name,
    email: person.email ?? userEmail ?? null,
    phone: person.emergency_contact_phone ?? null,
    dateOfBirth: person.date_of_birth ?? null,
  };
}

async function fetchParentAccountId(userProfileId: string): Promise<string> {
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

async function loadPerson(tenant: Tenant, personId: string): Promise<Person> {
  const { data, error } = await TenantDB.selectFor('people', tenant)
    .eq('id', personId)
    .single();
  if (error) throw error;
  return PersonSchema.parse(data);
}

async function loadGuardianMember(tenant: Tenant, accountId: string, userProfileId: string) {
  const { data: memberRows, error: memberError } = await TenantDB.selectFor('account_members', tenant)
    .eq('account_id', accountId)
    .eq('user_profile_id', userProfileId)
    .in('role', [...GUARDIAN_MEMBER_ROLES]);

  if (memberError) throw memberError;

  const rows = memberRows ?? [];
  if (rows.length === 0) {
    throw new Error('Guardian membership not found.');
  }

  const member =
    rows.find((row) => row.role === 'account_holder') ??
    rows[0];

  return member;
}

export async function resolveGuardianProfile(
  input: ResolveGuardianProfileInput,
): Promise<ResolveGuardianProfileResult> {
  const { tenant, userProfileId, userEmail, userPersonId } = input;

  let accountId: string;
  try {
    accountId = await fetchParentAccountId(userProfileId);
  } catch (err) {
    return {
      status: 'missing_account',
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }

  try {
    const member = await loadGuardianMember(tenant, accountId, userProfileId);
    const accountMemberId = member.id as string;
    const memberPersonId = (member.person_id as string | null) ?? null;

    if (memberPersonId) {
      const person = await loadPerson(tenant, memberPersonId);
      return {
        status: 'found',
        profile: guardianProfileFromPerson(person, accountId, accountMemberId, userEmail),
      };
    }

    if (userPersonId) {
      const person = await loadPerson(tenant, userPersonId);
      const { error: updateError } = await TenantDB.update(
        'account_members',
        tenant,
        accountMemberId,
        { person_id: userPersonId },
      );
      if (updateError) throw updateError;
      await writeMemberBackfillAudit(tenant, accountMemberId);

      return {
        status: 'found',
        profile: guardianProfileFromPerson(person, accountId, accountMemberId, userEmail),
      };
    }

    return { status: 'missing_person', accountId, accountMemberId };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/** Person ids to load engagements for on the parent portal (children + optional guardian). */
export function collectPortalPersonIds(
  children: Array<{ id: string }>,
  guardianPersonId: string | null | undefined,
): string[] {
  const ids = children.map((child) => child.id);
  if (guardianPersonId && !ids.includes(guardianPersonId)) {
    ids.push(guardianPersonId);
  }
  return ids;
}
