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
 * Returns whether a waiver is required and already signed for a specific
 * person + offering combination.
 *
 * IMPORTANT: Returns { required: false, signed: true } for:
 * - Guest users (no JWT — Edge Functions require auth)
 * - Offerings with waiver_required = false
 * - Tenants with no active consent_template
 *
 * In all these cases the server-side gate (stripe-webhook / adminEnrolmentService)
 * still enforces correctness if a waiver was somehow missed.
 */
export function useWaiverStatus({ personId, offeringId }: UseWaiverStatusParams) {
  const tenant = useTenant();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: [WAIVER_STATUS_KEY, tenant?.id, personId, offeringId],
    // Guest users have no JWT — waiver Edge Functions require Bearer auth.
    // Skip the waiver step for unauthenticated sessions entirely.
    enabled: !!tenant?.id && !!personId && !!offeringId && !!user,
    queryFn: async () => {
      // 1. Check offering.waiver_required
      const { data: offering } = await TenantDB.selectFor('offerings', tenant!)
        .select('waiver_required')
        .eq('id', offeringId!)
        .single();
      if (!offering?.waiver_required) {
        return { required: false, signed: true, template: null };
      }

      // 2. Get the active consent template
      const { data: templateRow } = await TenantDB.selectFor('consent_templates', tenant!)
        .eq('status', 'active')
        .maybeSingle();
      // No active template = no gate (admin should create one if waivers are required)
      if (!templateRow) {
        return { required: false, signed: true, template: null };
      }
      const template = ConsentTemplateSchema.parse(templateRow);

      // 3. Check for existing signed evidence matching this exact template version
      const { data: evidence } = await TenantDB.selectFor('waiver_evidence', tenant!)
        .select('id')
        .eq('person_id', personId!)
        .eq('consent_template_id', template.id)
        .eq('consent_version', template.version)
        .eq('status', 'signed')
        .maybeSingle();

      return { required: true, signed: !!evidence, template };
    },
    // When not enabled (guest / missing params), default to waiver not required
    placeholderData: { required: false, signed: true, template: null },
  });
}

/** Invalidate cached waiver status after a successful sign. */
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
