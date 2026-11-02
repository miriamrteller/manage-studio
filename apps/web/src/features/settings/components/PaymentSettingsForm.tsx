import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';
import { OfflinePaymentsSettingsForm, OFFLINE_PAYMENTS } from './OfflinePaymentsSettingsForm';
import { YpaySettingsForm } from './YpaySettingsForm';
import { tenantUsesBundledPayments } from '@/lib/tenantProviderRouting';
import { BUNDLED_PAYMENTS_SETUP_PATH } from '@/lib/bundledProviderUi';

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * Settings → Payment. "How customers pay" is always here, so the studio can switch between
 * paying at the studio and online card payment at any time. Paying at the studio needs no keys,
 * so nothing else shows. An online provider shows only its own connection details.
 */
export function PaymentSettingsForm() {
  const tenant = useTenant();
  const choice = (
    <div className="space-y-8">
      <OfflinePaymentsSettingsForm />
      <hr className="border-gray-200" />
    </div>
  );
  if (tenant?.payment_provider === OFFLINE_PAYMENTS) return <OfflinePaymentsSettingsForm />;
  if (tenantUsesBundledPayments(tenant)) {
    return (
      <div className="space-y-8">
        <OfflinePaymentsSettingsForm />
        <hr className="border-gray-200" />
        <ConnectBundledCard />
      </div>
    );
  }
  if (tenant?.payment_provider === 'ypay') {
    return (
      <>
        {choice}
        <YpaySettingsForm />
      </>
    );
  }
  return (
    <>
      {choice}
      <ProviderKeysForm />
    </>
  );
}

function ConnectBundledCard() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const navigate = useNavigate();
  const connected = Boolean(tenant?.payment_provider_secret_configured);
  return (
    <section className="space-y-3 max-w-lg" aria-labelledby="connect-bundled-title">
      <h2 id="connect-bundled-title" className="text-lg font-semibold text-foreground">
        {t('settings.payments.connect_title')}
      </h2>
      <p className="text-sm text-muted-foreground" role="status">
        {connected ? t('settings.payments.connected_note') : t('settings.payments.not_connected_note')}
      </p>
      <Button type="button" variant="primary" onClick={() => navigate(BUNDLED_PAYMENTS_SETUP_PATH)}>
        {connected ? t('settings.payments.connect_manage') : t('settings.payments.connect_now')}
      </Button>
    </section>
  );
}

function ProviderKeysForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('save_tenant_payment_credentials', {
        p_public_key: publicKey || null,
        p_secret_key: secretKey || null,
        p_webhook_secret: webhookSecret || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setSecretKey('');
      setWebhookSecret('');
      setMessage(t('settings.payments.saved', { defaultValue: 'Payment credentials saved.' }));
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  return (
    <section className="space-y-4 max-w-lg">
      <h2 className="text-lg font-semibold text-foreground">
        {t('settings.payments.title', { defaultValue: 'Payment provider' })}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t('settings.payments.description', { defaultValue: 'Configure payment capture credentials.' })}
      </p>

      <dl className="text-sm space-y-2">
        <StatusRow
          label={t('settings.payments.provider', { defaultValue: 'Provider' })}
          value={tenant?.payment_provider ?? 'grow'}
        />
        <StatusRow
          label={t('settings.payments.secret_status', { defaultValue: 'Secret key' })}
          value={
            tenant?.payment_provider_secret_configured
              ? t('settings.payments.configured', { defaultValue: 'Configured' })
              : t('settings.payments.not_configured', { defaultValue: 'Not configured' })
          }
        />
      </dl>

      <label className="block text-sm font-medium">
        {t('settings.payments.public_key', { defaultValue: 'Publishable key' })}
        <input
          type="text"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          placeholder={tenant?.payment_provider_public_key ?? 'pk_test_...'}
          autoComplete="off"
        />
      </label>

      <label className="block text-sm font-medium">
        {t('settings.payments.secret_key', { defaultValue: 'Secret key' })}
        <input
          type="password"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          autoComplete="new-password"
        />
      </label>

      <label className="block text-sm font-medium">
        {t('settings.payments.webhook_secret', { defaultValue: 'Webhook secret' })}
        <input
          type="password"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
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
