import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { TenantDB } from '@/lib/db';
import { PersonSchema } from '@shared/schemas';
import { resolveGuardianProfile } from '@/features/enrolment/lib/resolveGuardianProfile';
import { ClientPortalService, type ClientShoot } from '../services/clientPortalService';
import type { JobPaymentRequest } from '../services/jobPaymentService';

export interface ClientSelf {
  personId: string;
  accountId: string | null;
  name: string;
  email: string | null;
}

export interface ClientPortalData {
  /** null when the login is not linked to a client record yet. */
  self: ClientSelf | null;
  shoots: ClientShoot[];
  requests: JobPaymentRequest[];
}

/**
 * Resolves the signed-in client (an adult: no children, no date of birth) and
 * loads their shoots + payment requests. Read-only: unlike the dance parent
 * portal it never routes into guardian / child profile setup.
 */
async function resolveSelf(params: {
  tenant: NonNullable<ReturnType<typeof useTenant>>;
  userId: string;
  userEmail: string | null | undefined;
  userPersonId: string | null | undefined;
}): Promise<ClientSelf | null> {
  const { tenant, userId, userEmail, userPersonId } = params;
  const guardian = await resolveGuardianProfile({
    tenant,
    userProfileId: userId,
    userEmail,
    userPersonId,
  });
  if (guardian.status === 'found') {
    return {
      personId: guardian.profile.personId,
      accountId: guardian.profile.accountId,
      name: guardian.profile.name,
      email: guardian.profile.email,
    };
  }
  // Login linked straight to the person (people.user_profile_id), no account membership.
  if (userPersonId) {
    const { data, error } = await TenantDB.selectFor('people', tenant).eq('id', userPersonId).maybeSingle();
    if (error) throw error;
    if (data) {
      const person = PersonSchema.parse(data);
      return {
        personId: person.id,
        accountId: person.account_id ?? null,
        name: person.name,
        email: person.email ?? userEmail ?? null,
      };
    }
  }
  return null;
}

export function clientPortalKey(tenantId: string | undefined, userId: string | undefined) {
  return ['client-portal', tenantId, userId] as const;
}

export function useClientPortal() {
  const { user } = useCurrentUser();
  const tenant = useTenant();

  const query = useQuery({
    queryKey: clientPortalKey(tenant?.id, user?.id),
    queryFn: async (): Promise<ClientPortalData> => {
      if (!tenant?.id || !user?.id) throw new Error('User not authenticated');
      const self = await resolveSelf({
        tenant,
        userId: user.id,
        userEmail: user.email,
        userPersonId: user.person_id,
      });
      if (!self) return { self: null, shoots: [], requests: [] };
      const shoots = await ClientPortalService.listShoots(tenant.id, self);
      const requests = await ClientPortalService.listPaymentRequests(shoots.map((s) => s.engagementId));
      return { self, shoots, requests };
    },
    enabled: !!tenant?.id && !!user?.id,
  });

  return {
    data: query.data ?? null,
    isLoading: !query.data && query.isPending,
    error: query.error instanceof Error ? query.error : null,
  };
}
