import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import type { ManualPaymentMethod } from '../lib/manualPaymentMethods';

/** Something a payment can be for. Picking it records the payment the way its own screen does. */
export type PayableItem =
  | { kind: 'first'; key: string; engagementId: string; name: string; amountMinor: number | null }
  | { kind: 'monthly'; key: string; engagementId: string; name: string; amountMinor: number | null }
  | { kind: 'job'; key: string; requestId: string; name: string; amountMinor: number }
  | { kind: 'offering'; key: string; offeringId: string; name: string; amountMinor: number | null };

interface EngagementRow {
  id: string;
  status: string;
  /** Automatic class discount off the class price (sibling, extra class, early bird). */
  discount_minor?: number | null;
  offering: { id: string; name: string; price_minor: number | null; billing_mode: string | null } | null;
}

/**
 * Pure: a client's open items, first payments and monthly plans before project payments.
 * A pending enrolment or booking takes its first payment; an active monthly plan takes the
 * month due.
 */
export function openItemsFrom(
  engagements: EngagementRow[],
  requests: Array<{ id: string; label: string; amount_minor: number; status: string }>,
): PayableItem[] {
  const items: PayableItem[] = [];
  for (const e of engagements) {
    const name = e.offering?.name ?? '';
    const price = e.offering?.price_minor ?? null;
    const amountMinor = price === null ? null : Math.max(0, price - (e.discount_minor ?? 0));
    if (e.status === 'pending_payment') {
      items.push({ kind: 'first', key: `first:${e.id}`, engagementId: e.id, name, amountMinor });
    } else if (e.status === 'active' && e.offering?.billing_mode === 'recurring') {
      items.push({ kind: 'monthly', key: `monthly:${e.id}`, engagementId: e.id, name, amountMinor });
    }
  }
  for (const r of requests) {
    if (r.status === 'pending' || r.status === 'sent') {
      items.push({ kind: 'job', key: `job:${r.id}`, requestId: r.id, name: r.label, amountMinor: r.amount_minor });
    }
  }
  return items;
}

/** The chosen client's open items (enrolments and bookings to pay, monthly plans, project payments). */
export function useOpenItems(personId: string | null) {
  const tenant = useTenant();
  return useQuery({
    queryKey: ['record-payment-open-items', tenant?.id, personId],
    enabled: !!tenant?.id && !!personId,
    queryFn: async () => {
      const { data: engagements, error } = await supabase
        .from('engagements')
        .select('id, status, discount_minor, offering:offerings(id, name, price_minor, billing_mode)')
        .eq('tenant_id', tenant!.id)
        .eq('person_id', personId!)
        .in('status', ['pending_payment', 'active']);
      if (error) throw error;
      const { data: requests, error: requestError } = await supabase
        .from('job_payment_requests')
        .select('id, label, amount_minor, status, engagement:engagements!inner(person_id)')
        .eq('tenant_id', tenant!.id)
        .eq('engagement.person_id', personId!)
        .in('status', ['pending', 'sent']);
      if (requestError) throw requestError;
      return openItemsFrom(
        (engagements ?? []) as unknown as EngagementRow[],
        (requests ?? []) as unknown as Array<{ id: string; label: string; amount_minor: number; status: string }>,
      );
    },
  });
}

/** What the studio sells (its classes, services and packages), for a payment not linked to an item. */
export function useStudioOfferings() {
  const tenant = useTenant();
  return useQuery({
    queryKey: ['record-payment-offerings', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async (): Promise<PayableItem[]> => {
      const { data, error } = await supabase
        .from('offerings')
        .select('id, name, price_minor')
        .eq('tenant_id', tenant!.id)
        .neq('status', 'cancelled')
        .order('name');
      if (error) throw error;
      return ((data ?? []) as Array<{ id: string; name: string; price_minor: number | null }>).map((o) => ({
        kind: 'offering',
        key: `offering:${o.id}`,
        offeringId: o.id,
        name: o.name,
        amountMinor: o.price_minor,
      }));
    },
  });
}

/** The method the studio used for its last payment recorded by hand (prefill), if any. */
export function useLastManualMethod(): ManualPaymentMethod | null {
  const tenant = useTenant();
  const query = useQuery({
    queryKey: ['record-payment-last-method', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('payment_method')
        .eq('tenant_id', tenant!.id)
        .eq('provider', 'manual')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0]?.payment_method as string | undefined) ?? null;
    },
  });
  const value = query.data;
  return value === 'cash' || value === 'bank_transfer' || value === 'bit' ? value : null;
}
