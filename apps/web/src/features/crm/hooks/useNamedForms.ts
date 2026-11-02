import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { listNamedForms, namedFormCounts } from '../services/leadFormsService';

export function useNamedForms() {
  const tenant = useTenant();
  const forms = useQuery({
    queryKey: ['named-lead-forms', tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: () => listNamedForms(tenant!.id),
  });
  const counts = useQuery({
    queryKey: ['named-lead-form-counts', tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: () => namedFormCounts(tenant!.id),
  });
  return { forms: forms.data ?? [], counts: counts.data ?? {}, isLoading: forms.isLoading, error: forms.error as Error | null };
}
