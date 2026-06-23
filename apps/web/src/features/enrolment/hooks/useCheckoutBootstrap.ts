import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchCheckoutBootstrap } from '../lib/fetchCheckoutBootstrap';
import type {
  CheckoutBootstrapPhase,
  CheckoutChargePayload,
  EnrolmentCompletionContext,
  PrepareEnrolmentCheckoutBody,
} from '../lib/checkoutBootstrapTypes';

export function useCheckoutBootstrap(params: {
  phase: CheckoutBootstrapPhase;
  mode: PrepareEnrolmentCheckoutBody['mode'];
  engagementId?: string;
  offeringId?: string;
  personId?: string;
  seasonId?: string;
  enrolmentToken?: string;
  waiverEvidenceId?: string | null;
  ageOverrideConfirmed?: boolean;
  ageOverrideReason?: string | null;
  enabled: boolean;
}) {
  const { t } = useTranslation();

  const body: PrepareEnrolmentCheckoutBody | null =
    params.mode === 'existing_engagement' && params.engagementId
      ? {
          phase: params.phase,
          mode: 'existing_engagement',
          engagement_id: params.engagementId,
          ...(params.offeringId ? { offering_id: params.offeringId } : {}),
          ...(params.enrolmentToken ? { enrolment_token: params.enrolmentToken } : {}),
        }
      : params.mode === 'create_engagement' &&
          params.personId &&
          params.offeringId &&
          params.seasonId
        ? {
            phase: 'pay',
            mode: 'create_engagement',
            person_id: params.personId,
            offering_id: params.offeringId,
            season_id: params.seasonId,
            ...(params.waiverEvidenceId ? { waiver_evidence_id: params.waiverEvidenceId } : {}),
            ...(params.ageOverrideConfirmed ? { age_override_confirmed: true } : {}),
            ...(params.ageOverrideReason != null
              ? { age_override_reason: params.ageOverrideReason }
              : {}),
          }
        : null;

  const queryEnabled = params.enabled && body != null;

  const query = useQuery({
    queryKey: [
      'checkout-bootstrap',
      body?.mode,
      params.phase,
      params.engagementId,
      params.offeringId,
      params.personId,
      params.seasonId,
      params.enrolmentToken ?? null,
      params.waiverEvidenceId ?? null,
      params.ageOverrideConfirmed ?? false,
    ],
    queryFn: () =>
      fetchCheckoutBootstrap(body!, {
        enrolmentToken: params.enrolmentToken,
        setupFailedMessage: t('enrolment.payment_setup_failed'),
      }),
    enabled: queryEnabled,
    staleTime: params.phase === 'pay' ? Infinity : 60_000,
    retry: false,
  });

  const data = query.data;

  return {
    context: (data?.context ?? null) as EnrolmentCompletionContext | null,
    charge: (data?.charge ?? null) as CheckoutChargePayload | null,
    blockReason: data?.blockReason,
    isLoading: queryEnabled && query.isPending,
    loadError: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}
