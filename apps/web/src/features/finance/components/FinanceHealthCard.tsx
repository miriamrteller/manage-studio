import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';

export function FinanceHealthCard() {
  const { t } = useTranslation();
  const tenant = useTenant();

  const { data, isLoading } = useQuery({
    queryKey: ['finance-health', tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const [{ count: pending }, { count: dead }, { count: stuck }, { count: suspended }] =
        await Promise.all([
          supabase
            .from('document_queue')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenant!.id)
            .eq('status', 'pending'),
          supabase
            .from('document_queue')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenant!.id)
            .eq('status', 'dead'),
          supabase
            .from('document_queue')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenant!.id)
            .eq('status', 'processing')
            .lt('processing_started_at', staleCutoff),
          supabase
            .from('engagements')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenant!.id)
            .eq('billing_status', 'suspended'),
        ]);

      return {
        pending: pending ?? 0,
        dead: dead ?? 0,
        stuck: stuck ?? 0,
        suspended: suspended ?? 0,
      };
    },
  });

  if (isLoading || !data) {
    return null;
  }

  return (
    <section className="card border border-border p-4 space-y-2">
      <h2 className="text-lg font-semibold">
        {t('finance.health.title', { defaultValue: 'Finance health' })}
      </h2>
      <ul className="text-sm space-y-1">
        <li>{t('finance.health.pending_docs', { defaultValue: 'Pending documents' })}: {data.pending}</li>
        <li>{t('finance.health.dead_docs', { defaultValue: 'Dead-letter documents' })}: {data.dead}</li>
        <li>{t('finance.health.stuck_docs', { defaultValue: 'Stuck processing' })}: {data.stuck}</li>
        <li>{t('finance.health.suspended', { defaultValue: 'Suspended billing' })}: {data.suspended}</li>
      </ul>
    </section>
  );
}
