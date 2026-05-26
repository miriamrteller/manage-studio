import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import {
  PersonSchema,
  EnrolmentSchema,
  type Person,
  type Enrolment,
} from '@shared/schemas';

export interface EnrolmentWithClass extends Enrolment {
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
  invoice_number: string | null;
  description: string | null;
  person_id: string | null;
}

export interface ParentPortalData {
  children: Person[];
  enrolmentsByPerson: Record<string, EnrolmentWithClass[]>;
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

      const children = (peopleRows ?? []).map((row) => PersonSchema.parse(row));
      const personIds = children.map((p) => p.id);

      const enrolmentsByPerson: Record<string, EnrolmentWithClass[]> = {};
      for (const id of personIds) {
        enrolmentsByPerson[id] = [];
      }

      if (personIds.length > 0) {
        const { data: enrolmentRows, error: enrolmentError } = await supabase
          .from('enrolments')
          .select('*, classes(name, day_of_week, start_time)')
          .in('person_id', personIds)
          .order('created_at', { ascending: false });

        if (enrolmentError) throw enrolmentError;

        for (const row of enrolmentRows ?? []) {
          const enrolment = EnrolmentSchema.parse(row);
          const cls = row.classes as {
            name?: string;
            day_of_week?: number;
            start_time?: string;
          } | null;

          const entry: EnrolmentWithClass = {
            ...enrolment,
            className: cls?.name ?? null,
            classDay: cls?.day_of_week ?? null,
            classStartTime: cls?.start_time ?? null,
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
          'id, total_amount_minor, currency, status, paid_at, invoice_number, description, person_id',
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
        invoice_number: (p.invoice_number as string | null) ?? null,
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
