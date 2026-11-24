import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { useJob } from '@/features/jobs/hooks/useJobs';
import type { AutomaticEmailKey, QuoteDraft } from '../lib/quoteSchemas';
import { quotePrefillFromSource, type QuoteDraftPrefill } from '../lib/quoteDraft';
import { QuoteService, type QuoteSendVia } from '../services/quoteService';

export function useQuoteList() {
  const tenant = useTenant();
  return useQuery({
    queryKey: ['quotes', tenant?.id],
    queryFn: () => QuoteService.list(),
    enabled: !!tenant?.id,
  });
}

export function useQuote(id: string | null) {
  return useQuery({
    queryKey: ['quote', id],
    queryFn: () => (id ? QuoteService.get(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useQuotePackages() {
  const tenant = useTenant();
  return useQuery({
    queryKey: ['quote-packages', tenant?.id],
    queryFn: () => (tenant ? QuoteService.packages(tenant.id) : Promise.resolve([])),
    enabled: !!tenant?.id,
  });
}

/**
 * What a new quote can start from: the lead's or the shoot's package, date and client.
 * `isLoading` only while those load; a failed load just leaves the quote blank (never blocks).
 */
export function useNewQuotePrefill(source: { leadId: string | null; engagementId: string | null }): {
  prefill: QuoteDraftPrefill | null;
  isLoading: boolean;
} {
  const tenant = useTenant();
  const packages = useQuotePackages();
  const leadQuery = useQuery({
    queryKey: ['quote-source-lead', tenant?.id, source.leadId],
    queryFn: () => (tenant && source.leadId ? QuoteService.sourceLead(tenant.id, source.leadId) : Promise.resolve(null)),
    enabled: !!tenant?.id && !!source.leadId,
  });
  const { job, isLoading: jobLoading } = useJob(source.engagementId ?? undefined);

  const isLoading =
    packages.isLoading || (!!source.leadId && leadQuery.isLoading) || (!!source.engagementId && jobLoading);
  if (isLoading) return { prefill: null, isLoading: true };
  return {
    prefill: quotePrefillFromSource({ lead: leadQuery.data ?? null, job, packages: packages.data ?? [] }),
    isLoading: false,
  };
}

export function useQuoteMutations() {
  const queryClient = useQueryClient();
  const invalidate = (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['quotes'] });
    if (id) void queryClient.invalidateQueries({ queryKey: ['quote', id] });
  };
  const save = useMutation({
    mutationFn: (draft: QuoteDraft) => QuoteService.save(draft),
    onSuccess: (id) => invalidate(id),
  });
  const markSent = useMutation({
    mutationFn: (params: { id: string; via: QuoteSendVia }) => QuoteService.markSent(params.id, params.via),
    onSuccess: (_data, params) => invalidate(params.id),
  });
  return { save, markSent };
}

export function useAutomaticEmails() {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const key = ['automatic-emails', tenant?.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => (tenant ? QuoteService.automaticEmails(tenant.id) : Promise.reject(new Error('No tenant'))),
    enabled: !!tenant?.id,
  });
  const toggle = useMutation({
    mutationFn: (params: { key: AutomaticEmailKey; enabled: boolean }) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return QuoteService.setAutomaticEmail(tenant.id, params.key, params.enabled);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  return { settings: query.data, isLoading: query.isLoading, error: query.error, toggle };
}

export function useReviewUrl() {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const key = ['review-url', tenant?.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => (tenant ? QuoteService.reviewUrl(tenant.id) : Promise.reject(new Error('No tenant'))),
    enabled: !!tenant?.id,
  });
  const save = useMutation({
    mutationFn: (url: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return QuoteService.setReviewUrl(tenant.id, url);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  return { reviewUrl: query.data ?? null, isLoading: query.isLoading, save };
}
