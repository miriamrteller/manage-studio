import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

export function InvoicingSettingsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [accountId, setAccountId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [secret, setSecret] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('save_tenant_invoicing_credentials', {
        p_account_id: accountId || null,
        p_api_key: apiKey || null,
        p_secret: secret || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setApiKey('');
      setSecret('');
      setMessage(t('settings.invoicing.saved', { defaultValue: 'Invoicing credentials saved.' }));
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('verify-invoicing-credentials');
      if (error) throw error;
      if (!data?.valid) throw new Error((data?.message as string) ?? 'Connection failed');
      return data;
    },
    onSuccess: (data) => {
      setMessage(
        t('settings.invoicing.test_ok', {
          defaultValue: 'Connection OK ({{provider}}).',
          provider: data.provider as string,
        }),
      );
    },
    onError: (err: Error) => setMessage(err.message),
  });

  return (
    <section className="space-y-4 max-w-lg">
      <h2 className="text-lg font-semibold text-foreground">
        {t('settings.invoicing.title', { defaultValue: 'Invoicing provider' })}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t('settings.invoicing.description', { defaultValue: 'Tax document issuance credentials.' })}
      </p>
      <p className="text-sm">
        {t('settings.invoicing.provider', { defaultValue: 'Provider' })}:{' '}
        <strong>{tenant?.invoicing_provider ?? 'green_invoice'}</strong>
      </p>

      <label className="block text-sm font-medium">
        {t('settings.invoicing.account_id', { defaultValue: 'Account ID' })}
        <input
          type="text"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          autoComplete="off"
        />
      </label>

      <label className="block text-sm font-medium">
        {t('settings.invoicing.api_key', { defaultValue: 'API key' })}
        <input
          type="password"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="new-password"
        />
      </label>

      <label className="block text-sm font-medium">
        {t('settings.invoicing.secret', { defaultValue: 'Secret' })}
        <input
          type="password"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="new-password"
        />
      </label>

      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={saveMutation.isPending}
          isLoading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {t('common.save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={testMutation.isPending}
          isLoading={testMutation.isPending}
          onClick={() => testMutation.mutate()}
        >
          {t('settings.invoicing.test', { defaultValue: 'Test connection' })}
        </Button>
      </div>
    </section>
  );
}
