import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { hasParentRole } from '@/lib/parentRoles';
import { isAdminEnrolmentMode, type EnrollmentIntent } from '@/lib/enrollment-intent';
import { EnrolmentOnboardingService, type GuardianProfile } from '../onboardingService';
import type { ClassAgeContext } from '../lib/check-requirements';

export type EnrolmentMode = 'parent' | 'admin' | 'adult_student';

export interface EnrolmentConstraints {
  accountId?: string;
  ageBand?: ClassAgeContext | null;
}

export interface EnrolmentContextValue {
  mode: EnrolmentMode;
  constraints: EnrolmentConstraints;
  guardian: GuardianProfile | null;
  canSkipPersonStep: boolean;
  preselectedPersonId?: string;
  isLoading: boolean;
  error: Error | null;
}

function hasAdultStudentRole(roles: string[]): boolean {
  return roles.some((r) => ['student', 'adult_student'].includes(r));
}

export function useEnrolmentContext(intent: EnrollmentIntent | null): EnrolmentContextValue {
  const { user, isLoading: userLoading } = useCurrentUser();
  const tenant = useTenant();

  const offeringQuery = useQuery({
    queryKey: ['enrolment-offering', tenant?.id, intent?.classId],
    queryFn: async () => {
      if (!tenant?.id || !intent?.classId) return null;
      const { data, error } = await supabase
        .from('offerings')
        .select('id, min_age, max_age')
        .eq('tenant_id', tenant.id)
        .eq('id', intent.classId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id && !!intent?.classId,
  });

  const guardianQuery = useQuery({
    queryKey: ['enrolment-guardian', tenant?.id, user?.id],
    queryFn: async () => {
      if (!tenant || !user?.id) return null;
      return EnrolmentOnboardingService.getGuardianProfile(tenant, user.id, user.email);
    },
    enabled:
      !!tenant?.id &&
      !!user?.id &&
      hasParentRole(user.role) &&
      !(user.role.includes('tenant_admin') && isAdminEnrolmentMode(intent, user)),
  });

  const adminMode = isAdminEnrolmentMode(intent, user);

  const mode: EnrolmentMode = useMemo(() => {
    if (!user) return 'parent';
    if (user.role.includes('tenant_admin') && adminMode) {
      return 'admin';
    }
    if (hasParentRole(user.role) && guardianQuery.data) {
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
    };
  }, [intent?.accountId, offeringQuery.data]);

  const canSkipPersonStep = useMemo(() => {
    if (intent?.personId) return true;
    if (mode === 'adult_student' && user?.person_id && !adminMode) {
      return true;
    }
    return false;
  }, [intent?.personId, mode, user?.person_id, adminMode]);

  const isLoading =
    userLoading ||
    (!!intent?.classId && offeringQuery.isLoading) ||
    (mode === 'parent' && !adminMode && guardianQuery.isLoading);

  const error =
    (offeringQuery.error instanceof Error ? offeringQuery.error : null) ??
    (guardianQuery.error instanceof Error ? guardianQuery.error : null);

  return {
    mode,
    constraints,
    guardian: guardianQuery.data ?? null,
    canSkipPersonStep,
    preselectedPersonId: intent?.personId,
    isLoading,
    error,
  };
}
