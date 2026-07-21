import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

type Health = { valid: boolean; message?: string };

export type FinanceHealthProvider = 'grow' | 'icount' | 'invoice4u';

const VERIFY_FN: Record<FinanceHealthProvider, string> = {
  grow: 'verify-grow-credentials',
  icount: 'verify-icount-credentials',
  invoice4u: 'verify-invoice4u-credentials',
};

const COPY: Record<
  FinanceHealthProvider,
  { titleKey: string; okKey: string; failedKey: string; testKey: string; title: string; ok: string; failed: string; test: string }
> = {
  grow: {
    titleKey: 'settings.grow.health_title',
    okKey: 'settings.grow.health_ok',
    failedKey: 'settings.grow.health_failed',
    testKey: 'settings.grow.test_connection',
    title: 'Connection status',
    ok: 'Connected to Grow.',
    failed: 'Could not connect to Grow.',
    test: 'Test connection',
  },
  icount: {
    titleKey: 'settings.icount.health_title',
    okKey: 'settings.icount.health_ok',
    failedKey: 'settings.icount.health_failed',
    testKey: 'settings.icount.test_connection',
    title: 'Connection status',
    ok: 'Connected to iCount.',
    failed: 'Could not connect to iCount.',
    test: 'Test connection',
  },
  invoice4u: {
    titleKey: 'settings.invoice4u.health_title',
    okKey: 'settings.invoice4u.health_ok',
    failedKey: 'settings.invoice4u.health_failed',
    testKey: 'settings.invoice4u.test_connection',
    title: 'Connection status',
    ok: 'Connected to Invoice4U.',
    failed: 'Could not connect to Invoice4U.',
    test: 'Test connection',
  },
};

/**
 * On-demand bundled-provider auth health check for settings "Test connection".
 */
export function FinanceHealthCard({ provider }: { provider: FinanceHealthProvider }) {
  const { t } = useTranslation();
  const [health, setHealth] = useState<Health | null>(null);
  const copy = COPY[provider];

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
        {t(copy.titleKey, { defaultValue: copy.title })}
      </h3>

      {health && (
        <p
          className={health.valid ? 'text-sm text-green-700' : 'text-sm text-destructive'}
          role="status"
        >
          {health.valid
            ? t(copy.okKey, { defaultValue: copy.ok })
            : (health.message ?? t(copy.failedKey, { defaultValue: copy.failed }))}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        disabled={mutation.isPending}
        isLoading={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {t(copy.testKey, { defaultValue: copy.test })}
      </Button>
    </div>
  );
}
