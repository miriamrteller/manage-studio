import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { TenantDB } from '@/lib/db';
import {
  PersonSchema,
  FamilySchema,
  FamilyMemberSchema,
  ContactPreferencesSchema,
  EnrolmentSchema,
  BillingAccountSchema,
  ClassSchema,
  type BillingAccount,
  type Class,
} from '@shared/schemas';

export interface EnrolmentWithDetails {
  id: string;
  class_id: string;
  term_id: string;
  status: string;
  billing_account_id: string | null | undefined;
  created_at: string;
  className: string | null;
  billingAccount: BillingAccount | null;
}

/**
 * useStudentDetail: All data needed for the StudentSlideOver panel.
 * Runs parallel queries — each independent of the others.
 */
export function useStudentDetail(personId: string | null) {
  const tenant = useTenant();
  const isReady = !!tenant?.id && !!personId;

  const personQuery = useQuery({
    queryKey: ['student-detail-person', tenant?.id, personId],
    queryFn: async () => {
      if (!tenant || !personId) throw new Error('Missing params');
      const { data, error } = await TenantDB.selectFor('people', tenant)
        .eq('id', personId)
        .single();
      if (error) throw error;
      return PersonSchema.parse(data);
    },
    enabled: isReady,
  });

  const familyQuery = useQuery({
    queryKey: ['student-detail-family', tenant?.id, personQuery.data?.family_id],
    queryFn: async () => {
      if (!tenant || !personQuery.data?.family_id) return null;
      const { data, error } = await TenantDB.selectFor('families', tenant)
        .eq('id', personQuery.data.family_id)
        .single();
      if (error) throw error;
      return FamilySchema.parse(data);
    },
    enabled: isReady && !!personQuery.data?.family_id,
  });

  const membersQuery = useQuery({
    queryKey: ['student-detail-members', tenant?.id, personQuery.data?.family_id],
    queryFn: async () => {
      if (!tenant || !personQuery.data?.family_id) return [];
      const { data, error } = await TenantDB.selectFor('family_members', tenant)
        .eq('family_id', personQuery.data.family_id);
      if (error) throw error;
      return (data || []).map((m: unknown) => FamilyMemberSchema.parse(m));
    },
    enabled: isReady && !!personQuery.data?.family_id,
  });

  const contactPrefsQuery = useQuery({
    queryKey: ['student-detail-contact-prefs', tenant?.id, personId],
    queryFn: async () => {
      if (!tenant || !personId) return null;
      const { data, error } = await TenantDB.selectFor('contact_preferences', tenant)
        .eq('person_id', personId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return ContactPreferencesSchema.parse(data);
    },
    enabled: isReady,
  });

  const enrolmentsQuery = useQuery({
    queryKey: ['student-detail-enrolments', tenant?.id, personId],
    queryFn: async () => {
      if (!tenant || !personId) return [];
      const { data, error } = await TenantDB.selectFor('enrolments', tenant)
        .eq('person_id', personId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((e: unknown) => EnrolmentSchema.parse(e));
    },
    enabled: isReady,
  });

  // Fetch classes for enrolments and billing accounts where set
  const enrolments = enrolmentsQuery.data ?? [];

  const classIdsToFetch = [...new Set(enrolments.map((e) => e.class_id))];
  const billingIdsToFetch = [
    ...new Set(
      enrolments
        .map((e) => e.billing_account_id)
        .filter((id): id is string => !!id)
    ),
  ];

  const classesQuery = useQuery({
    queryKey: ['student-detail-classes', tenant?.id, classIdsToFetch],
    queryFn: async () => {
      if (!tenant || classIdsToFetch.length === 0) return [];
      const { data, error } = await TenantDB.selectFor('classes', tenant).in(
        'id',
        classIdsToFetch
      );
      if (error) throw error;
      return (data || []).map((c: unknown) => ClassSchema.parse(c));
    },
    enabled: isReady && classIdsToFetch.length > 0,
  });

  const billingAccountsQuery = useQuery({
    queryKey: ['student-detail-billing', tenant?.id, billingIdsToFetch],
    queryFn: async () => {
      if (!tenant || billingIdsToFetch.length === 0) return [];
      const { data, error } = await TenantDB.selectFor('billing_accounts', tenant).in(
        'id',
        billingIdsToFetch
      );
      if (error) throw error;
      return (data || []).map((a: unknown) => BillingAccountSchema.parse(a));
    },
    enabled: isReady && billingIdsToFetch.length > 0,
  });

  const classMap = new Map<string, Class>(
    (classesQuery.data ?? []).map((c) => [c.id, c])
  );
  const billingMap = new Map<string, BillingAccount>(
    (billingAccountsQuery.data ?? []).map((a) => [a.id, a])
  );

  const enrolmentsWithDetails: EnrolmentWithDetails[] = enrolments.map((e) => ({
    id: e.id,
    class_id: e.class_id,
    term_id: e.term_id,
    status: e.status,
    billing_account_id: e.billing_account_id,
    created_at: e.created_at,
    className: classMap.get(e.class_id)?.name ?? null,
    billingAccount: e.billing_account_id ? (billingMap.get(e.billing_account_id) ?? null) : null,
  }));

  const isLoading =
    personQuery.isLoading ||
    enrolmentsQuery.isLoading ||
    contactPrefsQuery.isLoading;

  return {
    person: personQuery.data,
    family: familyQuery.data ?? null,
    members: membersQuery.data ?? [],
    contactPrefs: contactPrefsQuery.data ?? null,
    enrolments: enrolmentsWithDetails,
    isLoading,
    error: personQuery.error,
  };
}
