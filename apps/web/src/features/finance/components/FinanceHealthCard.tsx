import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

type Health = { valid: boolean; message?: string };

/**
 * On-demand Grow auth health check. Calls verify-grow-credentials and shows whether the stored
 * credentials authenticate against the Grow sandbox/live API.
 */
export function FinanceHealthCard() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<Health | null>(null);

  const mutation = useMutation({
    mutationFn: async (): Promise<Health> => {
      const { data, error } = await supabase.functions.invoke('verify-grow-credentials', {
        body: {},
      });
      if (error) {
        return { valid: false, message: error.message };
      }
      return data as Health;
    },
    onSuccess: (data) => setHealth(data),
  });

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <h3 className="font-semibold">
        {t('settings.grow.health_title', { defaultValue: 'Connection status' })}
      </h3>

      {health && (
        <p
          className={health.valid ? 'text-sm text-green-700' : 'text-sm text-destructive'}
          role="status"
        >
          {health.valid
            ? t('settings.grow.health_ok', { defaultValue: 'Connected to Grow.' })
            : (health.message ??
              t('settings.grow.health_failed', { defaultValue: 'Could not connect to Grow.' }))}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        disabled={mutation.isPending}
        isLoading={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {t('settings.grow.test_connection', { defaultValue: 'Test connection' })}
      </Button>
    </div>
  );
}
