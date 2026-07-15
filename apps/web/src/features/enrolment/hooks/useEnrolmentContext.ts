import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { hasParentRole } from '@/lib/parentRoles';
import { isAdminEnrolmentMode, type EnrollmentIntent } from '@/lib/enrollment-intent';
import type { GuardianProfile } from '../onboardingService';
import { resolveGuardianProfile, type ResolveGuardianProfileResult } from '../lib/resolveGuardianProfile';
import {
  computeGuardianSetupRequired,
  type GuardianResolveStatus,
} from '../lib/guardianSetupRequired';
import { isAdultOffering } from '../lib/offering-intake';
import type { ClassAgeContext } from '../lib/check-requirements';
import { resolveTenantSubdomain } from '@/lib/resolveTenantSubdomain';

export type EnrolmentMode = 'guest' | 'parent' | 'admin' | 'adult_student';

export interface EnrolmentConstraints {
  accountId?: string;
  ageBand?: ClassAgeContext | null;
  seasonStartDate?: string | null;
}

export interface EnrolmentContextValue {
  mode: EnrolmentMode;
  constraints: EnrolmentConstraints;
  guardian: GuardianProfile | null;
  guardianResolveStatus: GuardianResolveStatus;
  guardianSetupRequired: boolean;
  guardianAccountId?: string;
  guardianAccountMemberId?: string;
  /** True when the selected/preselected class is for adults (min age 18+). */
  isAdultIntake: boolean;
  canSkipPersonStep: boolean;
  preselectedPersonId?: string;
  isLoading: boolean;
  error: Error | null;
  /**
   * Whether this offering requires a waiver.
   * Sourced from offerings.waiver_required — available once isLoading is false.
   * Null when the offering hasn't loaded yet (no classId in intent, or still loading).
   */
  waiverRequired: boolean | null;
  /** Preselected offering display info (name + location) when classId is in intent. */
  selectedOffering?: { name: string; location: string | null };
}

function hasAdultStudentRole(roles: string[]): boolean {
  return roles.some((r) => ['student', 'adult_student'].includes(r));
}

export function useEnrolmentContext(intent: EnrollmentIntent | null): EnrolmentContextValue {
  const { user, isLoading: userLoading } = useCurrentUser();
  const tenant = useTenant();

  const offeringQuery = useQuery({
    queryKey: ['enrolment-offering', tenant?.id, intent?.classId, user?.id],
    queryFn: async () => {
      if (!intent?.classId) return null;

      const subdomain = resolveTenantSubdomain();
      if (!user && subdomain) {
        const { data, error } = await supabase.rpc('get_public_offerings_by_subdomain', {
          p_subdomain: subdomain,
        });
        if (error) throw error;
        const row = (data ?? []).find((o: { id: string }) => o.id === intent.classId);
        if (!row) return null;
        return {
          id: row.id as string,
          name: row.name as string,
          location: (row.location as string | null) ?? null,
          min_age: row.min_age as number | null,
          max_age: row.max_age as number | null,
          season_start_date: (row.season_start_date ?? null) as string | null,
          waiver_required: (row.waiver_required ?? false) as boolean,
        };
      }

      if (!tenant?.id) return null;
      const { data, error } = await supabase
        .from('offerings')
        .select('id, name, location, min_age, max_age, season_id, waiver_required, seasons(start_date)')
        .eq('tenant_id', tenant.id)
        .eq('id', intent.classId)
        .eq('offering_type', 'class')
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const season = data.seasons as { start_date?: string } | null;
      return {
        id: data.id,
        name: data.name as string,
        location: (data.location as string | null) ?? null,
        min_age: data.min_age,
        max_age: data.max_age,
        season_start_date: season?.start_date ?? null,
        waiver_required: (data.waiver_required ?? false) as boolean,
      };
    },
    enabled: !!intent?.classId && (!!tenant?.id || !!resolveTenantSubdomain()),
  });

  const guardianQueryEnabled =
    !!tenant?.id &&
    !!user?.id &&
    hasParentRole(user.role) &&
    !(user.role.includes('tenant_admin') && isAdminEnrolmentMode(intent, user));

  const guardianQuery = useQuery({
    queryKey: ['enrolment-guardian', tenant?.id, user?.id],
    queryFn: async (): Promise<ResolveGuardianProfileResult | null> => {
      if (!tenant || !user?.id) return null;
      return resolveGuardianProfile({
        tenant,
        userProfileId: user.id,
        userEmail: user.email,
        userPersonId: user.person_id,
      });
    },
    enabled: guardianQueryEnabled,
  });

  const adminMode = isAdminEnrolmentMode(intent, user);

  const mode: EnrolmentMode = useMemo(() => {
    if (!user) return 'guest';
    if (user.role.includes('tenant_admin') && adminMode) {
      return 'admin';
    }
    if (user.role.includes('tenant_admin') && !hasParentRole(user.role)) {
      return 'admin';
    }
    if (hasParentRole(user.role) && guardianQuery.data?.status === 'found') {
      return 'parent';
    }
    if (user.person_id && hasAdultStudentRole(user.role)) {
      return 'adult_student';
    }
    if (hasParentRole(user.role)) {
      return 'parent';
    }
    if (user.person_id) {
      return 'adult_student';
    }
    return 'parent';
  }, [user, adminMode, guardianQuery.data]);

  const constraints: EnrolmentConstraints = useMemo(() => {
    const offering = offeringQuery.data;
    return {
      accountId: intent?.accountId,
      ageBand: offering
        ? { min_age: offering.min_age, max_age: offering.max_age }
        : null,
      seasonStartDate: offering?.season_start_date ?? null,
    };
  }, [intent?.accountId, offeringQuery.data]);

  const isAdultIntake = useMemo(
    () => isAdultOffering(constraints.ageBand),
    [constraints.ageBand],
  );

  const canSkipPersonStep = useMemo(() => {
    if (intent?.personId) return true;
    if (mode === 'adult_student' && user?.person_id && !adminMode) {
      return true;
    }
    return false;
  }, [intent?.personId, mode, user?.person_id, adminMode]);

  const guardianResolveStatus: GuardianResolveStatus = useMemo(() => {
    if (!guardianQueryEnabled) return 'loading';
    if (guardianQuery.isLoading) return 'loading';
    if (guardianQuery.error) return 'error';
    const result = guardianQuery.data;
    if (!result) return 'error';
    if (result.status === 'found') return 'found';
    if (result.status === 'missing_person') return 'missing_person';
    if (result.status === 'missing_account') return 'missing_account';
    return 'error';
  }, [guardianQuery.data, guardianQuery.error, guardianQuery.isLoading, guardianQueryEnabled]);

  const guardian = guardianQuery.data?.status === 'found' ? guardianQuery.data.profile : null;

  const guardianSetupRequired = useMemo(
    () =>
      computeGuardianSetupRequired({
        isAdultIntake,
        resolveStatus: guardianResolveStatus,
        dateOfBirth: guardian?.dateOfBirth ?? null,
      }),
    [guardian?.dateOfBirth, guardianResolveStatus, isAdultIntake],
  );

  const isLoading =
    userLoading ||
    (!!intent?.classId && offeringQuery.isLoading) ||
    (guardianQueryEnabled && guardianQuery.isLoading);

  const guardianQueryError =
    guardianQuery.data?.status === 'missing_account'
      ? guardianQuery.data.error
      : guardianQuery.data?.status === 'error'
        ? guardianQuery.data.error
        : guardianQuery.error instanceof Error
          ? guardianQuery.error
          : null;

  const error =
    (offeringQuery.error instanceof Error ? offeringQuery.error : null) ?? guardianQueryError;

  return {
    mode,
    constraints,
    guardian,
    guardianResolveStatus,
    guardianSetupRequired,
    guardianAccountId:
      guardianQuery.data?.status === 'missing_person' ? guardianQuery.data.accountId : undefined,
    guardianAccountMemberId:
      guardianQuery.data?.status === 'missing_person'
        ? guardianQuery.data.accountMemberId
        : undefined,
    isAdultIntake,
    canSkipPersonStep,
    preselectedPersonId: intent?.personId,
    isLoading,
    error,
    // null = offering not loaded yet; false = loaded, waiver not required; true = required
    waiverRequired: offeringQuery.data != null ? (offeringQuery.data.waiver_required ?? false) : null,
    selectedOffering:
      intent?.classId && offeringQuery.data
        ? {
            name: offeringQuery.data.name ?? '',
            location: offeringQuery.data.location ?? null,
          }
        : undefined,
  };
}
