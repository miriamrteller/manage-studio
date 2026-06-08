import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ConsentTemplateSchema } from '@shared/schemas';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { TenantDB } from '@/lib/db';

interface UseWaiverStatusParams {
  personId?: string;
  offeringId?: string;
}

const WAIVER_STATUS_KEY = 'waiver-status';

/**
 * Returns whether this enrolment requires a waiver signature.
 *
 * DESIGN: Every enrolment requires a fresh signature — we never check for
 * existing evidence. Each engagement gets its own waiver record.
 *
 * Returns { required: true, template } when:
 *   - The offering has waiver_required = true
 *   - An active consent template exists for this tenant
 *
 * Returns { required: false, template: null } when:
 *   - Guest users (no JWT — waiver Edge Functions require auth)
 *   - Offering has waiver_required = false
 *   - No active consent template exists
 *
 * In the guest case the server-side gate (stripe-webhook) enforces the waiver
 * via pending_waiver status and the post-payment email flow.
 */
export function useWaiverStatus({ personId, offeringId }: UseWaiverStatusParams) {
  const tenant = useTenant();
  const { user } = useCurrentUser();

  const query = useQuery({
    queryKey: [WAIVER_STATUS_KEY, tenant?.id, personId, offeringId],
    enabled: !!tenant?.id && !!offeringId && !!user,
    queryFn: async () => {
      // 1. Check if the offering requires a waiver
      const { data: offering } = await TenantDB.selectFor('offerings', tenant!)
        .select('waiver_required')
        .eq('id', offeringId!)
        .single();
      if (!offering?.waiver_required) {
        return { required: false, template: null };
      }

      // 2. Get the active consent template (no active template = no gate)
      const { data: templateRow } = await TenantDB.selectFor('consent_templates', tenant!)
        .eq('status', 'active')
        .maybeSingle();
      if (!templateRow) {
        return { required: false, template: null };
      }

      const template = ConsentTemplateSchema.parse(templateRow);
      return { required: true, template };
    },
    // Disabled queries and offerings without waivers both return "not required"
    placeholderData: { required: false, template: null },
  });

  return {
    data: query.data,
    /** True while the first fetch hasn't resolved yet (data is still placeholder). */
    isPlaceholderData: query.isPlaceholderData,
  };
}

/** Invalidate cached waiver status (e.g. after template version change). */
export function invalidateWaiverStatus(
  queryClient: ReturnType<typeof useQueryClient>,
  tenantId: string,
  personId: string,
  offeringId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: [WAIVER_STATUS_KEY, tenantId, personId, offeringId],
  });
}
