import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function StripeSettingsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [publishableKey, setPublishableKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('save_tenant_stripe_credentials', {
        p_publishable_key: publishableKey || null,
        p_secret_key: secretKey || null,
        p_webhook_secret: webhookSecret || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setSecretKey('');
      setWebhookSecret('');
      setMessage(t('settings.stripe.saved'));
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (err: Error) => {
      setMessage(err.message);
    },
  });

  return (
    <section className="space-y-4 max-w-lg">
      <h2 className="text-lg font-semibold text-foreground">{t('settings.stripe.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('settings.stripe.description')}</p>

      <dl className="text-sm space-y-2">
        <StatusRow
          label={t('settings.stripe.secret_status')}
          value={
            tenant?.stripe_secret_configured
              ? t('settings.stripe.configured')
              : t('settings.stripe.not_configured')
          }
        />
        <StatusRow
          label={t('settings.stripe.webhook_status')}
          value={
            tenant?.stripe_webhook_configured
              ? t('settings.stripe.configured')
              : t('settings.stripe.not_configured')
          }
        />
        {tenant?.stripe_credentials_updated_at && (
          <StatusRow
            label={t('settings.stripe.last_updated')}
            value={new Date(tenant.stripe_credentials_updated_at).toLocaleString()}
          />
        )}
      </dl>

      <label className="block text-sm font-medium">
        {t('settings.stripe.publishable_key')}
        <input
          type="text"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={publishableKey}
          onChange={(e) => setPublishableKey(e.target.value)}
          placeholder={tenant?.stripe_publishable_key ?? 'pk_test_...'}
          autoComplete="off"
        />
      </label>

      <label className="block text-sm font-medium">
        {t('settings.stripe.secret_key')}
        <input
          type="password"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          placeholder={t('settings.stripe.leave_blank')}
          autoComplete="new-password"
        />
      </label>

      <label className="block text-sm font-medium">
        {t('settings.stripe.webhook_secret')}
        <input
          type="password"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
          placeholder={t('settings.stripe.leave_blank')}
          autoComplete="new-password"
        />
      </label>

      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}

      <Button
        type="button"
        variant="primary"
        disabled={saveMutation.isPending}
        isLoading={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {t('common.save')}
      </Button>
    </section>
  );
}
