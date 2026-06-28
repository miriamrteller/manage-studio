import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { PersonSchema, type Person } from '@shared/schemas';
import { EnrolmentOnboardingService } from '../onboardingService';
import { coalesceGuardianPersonId } from '../lib/resolveGuardianProfile';

export interface StudentWithEnrolments extends Person {
  activeClassNames: string[];
}

export function useAccountStudents(options: { accountId?: string; enabled?: boolean } = {}) {
  const { user } = useCurrentUser();
  const tenant = useTenant();
  const { accountId: accountIdOverride, enabled = true } = options;

  return useQuery({
    queryKey: ['account-students', tenant?.id, user?.id, accountIdOverride],
    queryFn: async (): Promise<{
      accountId: string;
      guardianPersonId: string | null;
      students: StudentWithEnrolments[];
    }> => {
      if (!tenant?.id || !user?.id) {
        throw new Error('User not authenticated');
      }

      const accountId =
        accountIdOverride ?? (await EnrolmentOnboardingService.getParentAccountId(user.id));

      const { data: peopleRows, error: peopleError } = await supabase
        .from('people')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('account_id', accountId)
        .eq('status', 'active')
        .order('name');

      if (peopleError) throw peopleError;

      const students = (peopleRows ?? []).map((row) => PersonSchema.parse(row));
      const personIds = students.map((s) => s.id);

      const classNamesByPerson = new Map<string, string[]>();
      for (const id of personIds) {
        classNamesByPerson.set(id, []);
      }

      if (personIds.length > 0) {
        const { data: engagementRows, error: engagementError } = await supabase
          .from('engagements')
          .select('person_id, status, offerings(name)')
          .in('person_id', personIds)
          .in('status', ['active', 'pending_payment', 'admin_review']);

        if (engagementError) throw engagementError;

        for (const row of engagementRows ?? []) {
          const personId = row.person_id as string;
          const offering = row.offerings as { name?: string } | null;
          const names = classNamesByPerson.get(personId) ?? [];
          if (offering?.name) names.push(offering.name);
          classNamesByPerson.set(personId, names);
        }
      }

      const { data: memberRows } = await supabase
        .from('account_members')
        .select('person_id')
        .eq('account_id', accountId)
        .eq('user_profile_id', user.id)
        .limit(1);

      const guardianPersonId = coalesceGuardianPersonId(
        memberRows?.[0]?.person_id as string | null | undefined,
        user.person_id,
      );

      return {
        accountId,
        guardianPersonId,
        students: students.map((person) => ({
          ...person,
          activeClassNames: classNamesByPerson.get(person.id) ?? [],
        })),
      };
    },
    enabled: enabled && !!tenant?.id && !!user?.id,
  });
}
