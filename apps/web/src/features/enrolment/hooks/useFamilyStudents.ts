import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { PersonSchema } from '@shared/schemas';
import { filterStudentCandidates } from '../lib/filterStudentCandidates';
import type { EnrolmentConstraints } from './useEnrolmentContext';
import type { StudentWithEnrolments } from './useAccountStudents';

/** Load children for a family account (admin enrolment child picker). */
export function useFamilyStudents(accountId: string | undefined, enabled = true) {
  const tenant = useTenant();

  return useQuery({
    queryKey: ['family-students', tenant?.id, accountId],
    queryFn: async (): Promise<{
      accountId: string;
      guardianPersonId: string | null;
      students: StudentWithEnrolments[];
    }> => {
      if (!tenant?.id || !accountId) {
        throw new Error('Missing tenant or account');
      }

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

      const { data: holderRows } = await supabase
        .from('account_members')
        .select('person_id')
        .eq('tenant_id', tenant.id)
        .eq('account_id', accountId)
        .eq('role', 'account_holder')
        .limit(1);

      const guardianPersonId = (holderRows?.[0]?.person_id as string | undefined) ?? null;

      return {
        accountId,
        guardianPersonId,
        students: students.map((person) => ({
          ...person,
          activeClassNames: classNamesByPerson.get(person.id) ?? [],
        })),
      };
    },
    enabled: enabled && !!tenant?.id && !!accountId,
  });
}

export function partitionFamilyStudents(
  students: StudentWithEnrolments[],
  guardianPersonId: string | null,
  constraints: EnrolmentConstraints,
) {
  return filterStudentCandidates(students, constraints, guardianPersonId);
}
