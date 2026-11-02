import { useQuery } from '@tanstack/react-query';
import {
  formQuestions,
  leadFormKindFor,
  parseLeadFormConfig,
  type ClassOption,
  type FormQuestion,
} from '@shared/index';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';

/**
 * The studio's extra enquiry questions for the public form: its saved config
 * (get_lead_form) and, when the class question is on, its public classes.
 * Any failure shows just the built-in fields: the form must keep working.
 */
export function useLeadFormQuestions(): { questions: FormQuestion[]; loading: boolean } {
  const tenant = useTenant();
  const kind = leadFormKindFor(tenant?.vertical, tenant?.business_preset);
  const query = useQuery({
    queryKey: ['lead-form-questions', tenant?.id, kind],
    enabled: Boolean(tenant?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FormQuestion[]> => {
      const { data, error } = await supabase.rpc('get_lead_form', { p_tenant_id: tenant!.id });
      if (error) return [];
      const config = parseLeadFormConfig(data);
      let classes: ClassOption[] = [];
      if (kind === 'classes' && config.presets.class_interest?.enabled && tenant?.subdomain) {
        const res = await supabase.rpc('get_public_offerings_by_subdomain', { p_subdomain: tenant.subdomain });
        const rows = (res.data ?? []) as Array<{ id: string; name: string }>;
        const seen = new Set<string>();
        classes = rows.filter((r) => !seen.has(r.id) && seen.add(r.id)).map((r) => ({ id: r.id, name: r.name }));
      }
      return formQuestions(config, kind, classes);
    },
  });
  return { questions: query.data ?? [], loading: query.isLoading };
}
