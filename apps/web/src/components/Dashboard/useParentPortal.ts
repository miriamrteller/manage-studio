import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import {
  PersonSchema,
  EngagementSchema,
  type Person,
  type Engagement,
} from '@shared/schemas';

export interface EngagementWithOffering extends Engagement {
  className: string | null;
  classDay: number | null;
  classStartTime: string | null;
}

export interface ParentPayment {
  id: string;
  total_amount_minor: number;
  currency: string;
  status: string;
  paid_at: string | null;
  external_document_number: string | null;
  invoice_url: string | null;
  description: string | null;
  person_id: string | null;
}

export interface ParentPortalData {
  children: Person[];
  enrolmentsByPerson: Record<string, EngagementWithOffering[]>;
  payments: ParentPayment[];
}

export interface ParentPortalState {
  data: ParentPortalData | null;
  isLoading: boolean;
  error: Error | null;
}

export function useParentPortal(): ParentPortalState {
  const { user } = useCurrentUser();
  const tenant = useTenant();

  const query = useQuery({
    queryKey: ['parent-portal', tenant?.id, user?.id],
    queryFn: async (): Promise<ParentPortalData> => {
      if (!tenant?.id || !user?.id) {
        throw new Error('User not authenticated');
      }

      const { data: peopleRows, error: peopleError } = await supabase
        .from('people')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('name');

      if (peopleError) throw peopleError;

      const children = (peopleRows ?? [])
        .map((row) => PersonSchema.parse(row))
        .filter((person) => person.account_id != null);
      const personIds = children.map((p) => p.id);

      const enrolmentsByPerson: Record<string, EngagementWithOffering[]> = {};
      for (const id of personIds) {
        enrolmentsByPerson[id] = [];
      }

      if (personIds.length > 0) {
        const { data: enrolmentRows, error: enrolmentError } = await supabase
          .from('engagements')
          .select('*, offerings(name, day_of_week, start_time)')
          .in('person_id', personIds)
          .order('created_at', { ascending: false });

        if (enrolmentError) throw enrolmentError;

        for (const row of enrolmentRows ?? []) {
          const enrolment = EngagementSchema.parse(row);
          const offering = row.offerings as {
            name?: string;
            day_of_week?: number;
            start_time?: string;
          } | null;

          const entry: EngagementWithOffering = {
            ...enrolment,
            className: offering?.name ?? null,
            classDay: offering?.day_of_week ?? null,
            classStartTime: offering?.start_time ?? null,
          };

          if (!enrolmentsByPerson[enrolment.person_id]) {
            enrolmentsByPerson[enrolment.person_id] = [];
          }
          enrolmentsByPerson[enrolment.person_id].push(entry);
        }
      }

      const { data: paymentRows, error: paymentError } = await supabase
        .from('payments')
        .select(
          'id, total_amount_minor, currency, status, paid_at, external_document_number, invoice_url, description, person_id',
        )
        .eq('tenant_id', tenant.id)
        .order('paid_at', { ascending: false, nullsFirst: false });

      if (paymentError) throw paymentError;

      const payments: ParentPayment[] = (paymentRows ?? []).map((p) => ({
        id: p.id as string,
        total_amount_minor: p.total_amount_minor as number,
        currency: p.currency as string,
        status: p.status as string,
        paid_at: (p.paid_at as string | null) ?? null,
        external_document_number: (p.external_document_number as string | null) ?? null,
        invoice_url: (p.invoice_url as string | null) ?? null,
        description: (p.description as string | null) ?? null,
        person_id: (p.person_id as string | null) ?? null,
      }));

      return { children, enrolmentsByPerson, payments };
    },
    enabled: !!tenant?.id && !!user?.id,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
  };
}
