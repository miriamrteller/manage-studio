import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';
import { FinanceHealthCard } from '@/features/finance/components/FinanceHealthCard';
import {
  fetchGrowWebhookKeyStatus,
  GROW_WEBHOOK_KEY_STATUS_QUERY,
  GrowWebhookKeyPanel,
  rotateGrowWebhookKey,
} from './GrowWebhookKeyPanel';
import { isProviderSwitchBlockedError } from '@/lib/providerPairing';

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * Single onboarding surface for Grow (Meshulam), which bundles payment capture and tax-document
 * issuance. Stores the Grow user id, page code, and API key via save_tenant_grow_credentials and
 * surfaces a live connection test through FinanceHealthCard. Saving the credentials also makes
 * the webhook key Grow must send with every payment notice, if the studio has none yet.
 */
export function GrowSettingsForm({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [userId, setUserId] = useState('');
  const [pageCode, setPageCode] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [newWebhookKey, setNewWebhookKey] = useState<string | null>(null);

  const trimmedMissing = !userId.trim() || !pageCode.trim() || !apiKey.trim();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('save_tenant_grow_credentials', {
        p_user_id: userId.trim(),
        p_page_code: pageCode.trim(),
        p_api_key: apiKey.trim(),
      });
      if (error) throw error;
      // Notices are rejected without a webhook key, so make one with the first save.
      const status = await fetchGrowWebhookKeyStatus();
      return status.configured ? null : await rotateGrowWebhookKey();
    },
    onSuccess: async (createdKey) => {
      setApiKey('');
      if (createdKey) setNewWebhookKey(createdKey);
      setMessage(
        createdKey
          ? t('settings.grow.saved_with_key', {
              defaultValue: 'Grow credentials saved. Now add the webhook key below to your Grow account.',
            })
          : t('settings.grow.saved', { defaultValue: 'Grow credentials saved.' }),
      );
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
      await queryClient.invalidateQueries({ queryKey: GROW_WEBHOOK_KEY_STATUS_QUERY });
    },
    onError: (err: Error) => setMessage(isProviderSwitchBlockedError(err) ? t('settings.offline_payments.switch_contact_support') : err.message),
  });

  return (
    <section className="space-y-4 max-w-lg">
      {!embedded && (
        <>
          <h2 className="text-lg font-semibold text-foreground">
            {t('settings.grow.title', { defaultValue: 'Payments & invoices (Grow)' })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('settings.grow.description', {
              defaultValue:
                'Grow captures card payments and issues the tax document together. Enter your Grow (Meshulam) credentials below.',
            })}
          </p>
        </>
      )}

      <dl className="text-sm space-y-2">
        <StatusRow
          label={t('settings.grow.provider', { defaultValue: 'Provider' })}
          value={tenant?.payment_provider ?? 'grow'}
        />
        <StatusRow
          label={t('settings.grow.api_key_status', { defaultValue: 'API key' })}
          value={
            tenant?.payment_provider_secret_configured
              ? t('settings.grow.configured', { defaultValue: 'Configured' })
              : t('settings.grow.not_configured', { defaultValue: 'Not configured' })
          }
        />
      </dl>

      <label className="block text-sm font-medium">
        {t('settings.grow.user_id', { defaultValue: 'Grow user ID' })}
        <input
          type="text"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          autoComplete="off"
        />
      </label>

      <label className="block text-sm font-medium">
        {t('settings.grow.page_code', { defaultValue: 'Page code' })}
        <input
          type="text"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={pageCode}
          onChange={(e) => setPageCode(e.target.value)}
          placeholder={tenant?.payment_provider_public_key ?? ''}
          autoComplete="off"
        />
      </label>

      <label className="block text-sm font-medium">
        {t('settings.grow.api_key', { defaultValue: 'API key' })}
        <input
          type="password"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
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
        disabled={saveMutation.isPending || trimmedMissing}
        isLoading={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {t('common.save')}
      </Button>

      <GrowWebhookKeyPanel
        newKey={newWebhookKey}
        onNewKey={setNewWebhookKey}
        headingLevel={embedded ? 2 : 3}
      />

      <FinanceHealthCard provider="grow" />
    </section>
  );
}
