import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { TenantDB } from '@/lib/db';
import {
  filterEnrolmentsByStatus,
  type StudentEnrolmentSummary,
} from '@/features/enrolment/lib/enrolmentFilterOptions';
import type { Person } from '@shared/schemas';

export interface StudentsListFamily {
  contact_person_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
}

export interface StudentsListContactPrefs {
  preferred_channel: string;
  whatsapp_verified: boolean;
  whatsapp_number: string | null;
}

interface EnrolmentRow {
  id: unknown;
  person_id: string;
  offering_id: string;
  status: unknown;
}

/**
 * Everything the Students list shows next to each person on the current page:
 * enrolments (by class name), family contact and notification preference.
 * The enrolments themselves are fetched by StudentsList.
 */
export function useStudentsListLookups({
  students,
  enrolments,
  enrolmentStatusFilterValues,
}: {
  students: Person[];
  enrolments: EnrolmentRow[] | undefined;
  enrolmentStatusFilterValues: string[];
}) {
  const tenant = useTenant();
  const personIds = students.map((s) => s.id);

  // Fetch families for students that have a account_id
  const accountIds = [...new Set(students.flatMap((s) => (s.account_id ? [s.account_id] : [])))];
  const familiesQuery = useQuery({
    queryKey: ['students-list-families', tenant?.id, accountIds],
    queryFn: async () => {
      if (!tenant || accountIds.length === 0) return [];
      const { data, error } = await TenantDB.selectFor('accounts', tenant)
        .in('id', accountIds)
        .select('id, name, person_id, guardian:people!accounts_person_id_fkey(name, email, emergency_contact_phone)');
      if (error) throw error;
      return (data ?? []).map((row) => {
        const guardian = row.guardian as {
          name?: string;
          email?: string | null;
          emergency_contact_phone?: string | null;
        } | null;
        return {
          id: row.id as string,
          contact_person_name: guardian?.name ?? null,
          contact_email: guardian?.email ?? null,
          contact_phone: guardian?.emergency_contact_phone ?? null,
        };
      });
    },
    enabled: !!tenant?.id && accountIds.length > 0,
  });

  // Fetch class names for the enrolments
  const classIds = [
    ...new Set((enrolments ?? []).map((e: { offering_id: string }) => e.offering_id)),
  ];
  const classNamesQuery = useQuery({
    queryKey: ['students-list-class-names', tenant?.id, classIds],
    queryFn: async () => {
      if (!tenant || classIds.length === 0) return [];
      const { data, error } = await TenantDB.selectFor('offerings', tenant).in('id', classIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id && classIds.length > 0,
  });

  // Fetch contact_preferences for current page
  const contactPrefsQuery = useQuery({
    queryKey: ['students-list-contact-prefs', tenant?.id, personIds],
    queryFn: async () => {
      if (!tenant || personIds.length === 0) return [];
      const { data, error } = await TenantDB.selectFor('contact_preferences', tenant).in(
        'person_id',
        personIds
      );
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id && personIds.length > 0,
  });

  // Build lookup maps
  const classNameMap = useMemo(
    () =>
      new Map<string, string>(
        (classNamesQuery.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name])
      ),
    [classNamesQuery.data]
  );

  const enrolmentsByPerson = useMemo(() => {
    const map = new Map<string, StudentEnrolmentSummary[]>();
    for (const e of enrolments ?? []) {
      const existing = map.get(e.person_id) ?? [];
      const cn = classNameMap.get(e.offering_id) ?? e.offering_id;
      existing.push({
        id: e.id as string,
        offeringId: e.offering_id as string,
        className: cn,
        status: e.status as StudentEnrolmentSummary['status'],
      });
      map.set(e.person_id, existing);
    }
    if (enrolmentStatusFilterValues.length === 0) return map;
    const filtered = new Map<string, StudentEnrolmentSummary[]>();
    for (const [personId, entries] of map) {
      const next = filterEnrolmentsByStatus(entries, enrolmentStatusFilterValues);
      if (next.length > 0) filtered.set(personId, next);
    }
    return filtered;
  }, [enrolments, classNameMap, enrolmentStatusFilterValues]);

  const familyMap = useMemo(
    () =>
      new Map<string, StudentsListFamily>(
        (familiesQuery.data ?? []).map((f: { id: string } & StudentsListFamily) => [f.id, f])
      ),
    [familiesQuery.data]
  );

  const contactPrefsMap = useMemo(
    () =>
      new Map<string, StudentsListContactPrefs>(
        (contactPrefsQuery.data ?? []).map(
          (cp: { person_id: string } & StudentsListContactPrefs) => [
            cp.person_id,
            cp,
          ]
        )
      ),
    [contactPrefsQuery.data]
  );

  return { enrolmentsByPerson, familyMap, contactPrefsMap };
}
