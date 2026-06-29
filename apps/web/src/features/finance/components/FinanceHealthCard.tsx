import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

type Health = { valid: boolean; message?: string };

type FinanceHealthProvider = 'grow' | 'icount';

const VERIFY_FN: Record<FinanceHealthProvider, string> = {
  grow: 'verify-grow-credentials',
  icount: 'verify-icount-credentials',
};

/**
 * On-demand bundled-provider auth health check for settings "Test connection".
 */
export function FinanceHealthCard({ provider }: { provider: FinanceHealthProvider }) {
  const { t } = useTranslation();
  const [health, setHealth] = useState<Health | null>(null);

  const copy =
    provider === 'icount'
      ? {
          title: 'Connection status',
          ok: 'Connected to iCount.',
          failed: 'Could not connect to iCount.',
          test: 'Test connection',
        }
      : {
          title: 'Connection status',
          ok: 'Connected to Grow.',
          failed: 'Could not connect to Grow.',
          test: 'Test connection',
        };

  const mutation = useMutation({
    mutationFn: async (): Promise<Health> => {
      const { data, error } = await supabase.functions.invoke(VERIFY_FN[provider], {
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
        {t(
          provider === 'icount' ? 'settings.icount.health_title' : 'settings.grow.health_title',
          { defaultValue: copy.title },
        )}
      </h3>

      {health && (
        <p
          className={health.valid ? 'text-sm text-green-700' : 'text-sm text-destructive'}
          role="status"
        >
          {health.valid
            ? t(
                provider === 'icount' ? 'settings.icount.health_ok' : 'settings.grow.health_ok',
                { defaultValue: copy.ok },
              )
            : (health.message ??
              t(
                provider === 'icount'
                  ? 'settings.icount.health_failed'
                  : 'settings.grow.health_failed',
                { defaultValue: copy.failed },
              ))}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        disabled={mutation.isPending}
        isLoading={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {t(
          provider === 'icount' ? 'settings.icount.test_connection' : 'settings.grow.test_connection',
          { defaultValue: copy.test },
        )}
      </Button>
    </div>
  );
}
