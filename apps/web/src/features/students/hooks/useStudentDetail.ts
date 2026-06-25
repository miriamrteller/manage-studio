import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { TenantDB } from '@/lib/db';
import {
  PersonSchema,
  AccountSchema,
  AccountMemberSchema,
  ContactPreferencesSchema,
  EngagementSchema,
  BillingAccountSchema,
  OfferingSchema,
  type BillingAccount,
  type Offering,
  type Person,
  type AccountMember,
} from '@shared/schemas';

export interface AccountMemberWithName {
  id: string;
  role: AccountMember['role'];
  person_id: string;
  name: string;
}

export interface EngagementWithDetails {
  id: string;
  offering_id: string;
  season_id: string | null | undefined;
  status: string;
  billing_account_id: string | null | undefined;
  created_at: string;
  className: string | null;
  billingAccount: BillingAccount | null;
}

export interface StudentPayment {
  id: string;
  engagement_id: string | null;
  charge_type: string;
  status: string;
  total_amount_minor: number;
  refund_amount_minor: number | null;
  currency: string;
  provider: string;
  paid_at: string | null;
  description: string | null;
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
    queryKey: ['student-detail-family', tenant?.id, personQuery.data?.account_id],
    queryFn: async () => {
      if (!tenant || !personQuery.data?.account_id) return null;
      const { data, error } = await TenantDB.selectFor('accounts', tenant)
        .eq('id', personQuery.data.account_id)
        .single();
      if (error) throw error;
      return AccountSchema.parse(data);
    },
    enabled: isReady && !!personQuery.data?.account_id,
  });

  const membersQuery = useQuery({
    queryKey: ['student-detail-members', tenant?.id, personQuery.data?.account_id],
    queryFn: async () => {
      if (!tenant || !personQuery.data?.account_id) return [];
      const { data, error } = await TenantDB.selectFor('account_members', tenant)
        .eq('account_id', personQuery.data.account_id);
      if (error) throw error;
      return (data || []).map((m: unknown) => AccountMemberSchema.parse(m));
    },
    enabled: isReady && !!personQuery.data?.account_id,
  });

  const guardianQuery = useQuery({
    queryKey: ['student-detail-guardian', tenant?.id, familyQuery.data?.person_id],
    queryFn: async () => {
      if (!tenant || !familyQuery.data?.person_id) return null;
      const { data, error } = await TenantDB.selectFor('people', tenant)
        .eq('id', familyQuery.data.person_id)
        .single();
      if (error) throw error;
      return PersonSchema.parse(data);
    },
    enabled: isReady && !!familyQuery.data?.person_id,
  });

  const memberPeopleQuery = useQuery({
    queryKey: [
      'student-detail-member-people',
      tenant?.id,
      (membersQuery.data ?? []).map((m) => m.person_id).join(','),
    ],
    queryFn: async () => {
      const members = membersQuery.data ?? [];
      if (!tenant || members.length === 0) return new Map<string, Person>();

      const ids = [...new Set(members.map((m) => m.person_id))];
      const { data, error } = await TenantDB.selectFor('people', tenant).in('id', ids);
      if (error) throw error;

      return new Map(
        (data ?? []).map((row) => {
          const person = PersonSchema.parse(row);
          return [person.id, person] as const;
        }),
      );
    },
    enabled: isReady && (membersQuery.data?.length ?? 0) > 0,
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
      const { data, error } = await TenantDB.selectFor('engagements', tenant)
        .eq('person_id', personId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((e: unknown) => EngagementSchema.parse(e));
    },
    enabled: isReady,
  });

  const paymentsQuery = useQuery({
    queryKey: ['student-detail-payments', tenant?.id, personId],
    queryFn: async (): Promise<StudentPayment[]> => {
      if (!tenant || !personId) return [];
      const { data, error } = await TenantDB.selectFor('payments', tenant)
        .eq('person_id', personId)
        .order('paid_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as StudentPayment[];
    },
    enabled: isReady,
  });

  // Fetch classes for enrolments and billing accounts where set
  const enrolments = enrolmentsQuery.data ?? [];

  const classIdsToFetch = [...new Set(enrolments.map((e) => e.offering_id))];
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
      const { data, error } = await TenantDB.selectFor('offerings', tenant).in(
        'id',
        classIdsToFetch
      );
      if (error) throw error;
      return (data || []).map((c: unknown) => OfferingSchema.parse(c));
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

  const classMap = new Map<string, Offering>(
    (classesQuery.data ?? []).map((c) => [c.id, c])
  );
  const billingMap = new Map<string, BillingAccount>(
    (billingAccountsQuery.data ?? []).map((a) => [a.id, a])
  );

  const enrolmentsWithDetails: EngagementWithDetails[] = enrolments.map((e) => ({
    id: e.id,
    offering_id: e.offering_id,
    season_id: e.season_id,
    status: e.status,
    billing_account_id: e.billing_account_id,
    created_at: e.created_at,
    className: classMap.get(e.offering_id)?.name ?? null,
    billingAccount: e.billing_account_id ? (billingMap.get(e.billing_account_id) ?? null) : null,
  }));

  const isLoading =
    personQuery.isLoading ||
    enrolmentsQuery.isLoading ||
    contactPrefsQuery.isLoading;

  const membersWithNames: AccountMemberWithName[] = (membersQuery.data ?? []).map((member) => ({
    id: member.id,
    role: member.role,
    person_id: member.person_id,
    name: memberPeopleQuery.data?.get(member.person_id)?.name ?? '—',
  }));

  return {
    person: personQuery.data,
    family: familyQuery.data ?? null,
    guardian: guardianQuery.data ?? null,
    members: membersWithNames,
    contactPrefs: contactPrefsQuery.data ?? null,
    enrolments: enrolmentsWithDetails,
    engagementRecords: enrolments,
    offerings: classesQuery.data ?? [],
    payments: paymentsQuery.data ?? [],
    isLoading,
    error: personQuery.error,
  };
}
