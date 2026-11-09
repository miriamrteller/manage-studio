import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { isDevSite } from '@/lib/devStudioPicker';
import queryClient from '@/lib/query-client';
import { functionInvokeErrorMessage, parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';
import { isEncryptionKeyMissing } from './YpaySettingsForm';

/**
 * Settings -> Payments, testing only (beta switch billing:takbull_testing, off for every studio
 * unless switched on in Platform -> Features). Dev website only: never shown on the live site,
 * even if the switch is on (owner, 9 Nov 2026). Saves the studio's Takbull API key and secret,
 * both encrypted (save_tenant_takbull_credentials), and checks them with Test connection
 * (verify-takbull-credentials, read-only). It doesn't change the studio's payment provider.
 */
export function TakbullTestingForm() {
  const { hasFeature } = useFeatureGate();
  if (!isDevSite() || !hasFeature(FEATURES.billing.takbullTesting)) return null;
  return <TakbullKeysForm />;
}

function TakbullKeysForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const friendly = (raw: string) => (isEncryptionKeyMissing(raw) ? t('settings.takbull.encryption_missing') : raw);

  const savedAt = useQuery({
    queryKey: ['takbull-credentials-updated-at', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('takbull_credentials_updated_at')
        .eq('id', tenant!.id)
        .single();
      if (error) throw error;
      return (data?.takbull_credentials_updated_at as string | null) ?? null;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('save_tenant_takbull_credentials', {
        p_api_key: apiKey.trim(),
        p_api_secret: apiSecret.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setApiKey('');
      setApiSecret('');
      setMessage({ kind: 'ok', text: t('settings.takbull.saved') });
      await queryClient.invalidateQueries({ queryKey: ['takbull-credentials-updated-at'] });
    },
    onError: (err: Error) => setMessage({ kind: 'error', text: friendly(err.message) }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('verify-takbull-credentials');
      const body = await parseFunctionInvokeBody(data, error);
      if (body?.valid === true) return;
      throw new Error(functionInvokeErrorMessage(error, body, t('settings.takbull.test_failed')));
    },
    onSuccess: () => setMessage({ kind: 'ok', text: t('settings.takbull.test_ok') }),
    onError: (err: Error) => setMessage({ kind: 'error', text: friendly(err.message) }),
  });

  const missing = !apiKey.trim() || !apiSecret.trim();
  const saved = Boolean(savedAt.data);

  return (
    <section className="space-y-4 max-w-lg" aria-labelledby="takbull-testing-title">
      <h2 id="takbull-testing-title" className="text-lg font-semibold text-foreground">
        {t('settings.takbull.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('settings.takbull.hint')}</p>
      <p className="text-sm" role="status">
        {saved
          ? t('settings.takbull.saved_on', { date: new Date(savedAt.data!).toLocaleString() })
          : t('settings.takbull.not_saved')}
      </p>

      <label className="block text-sm font-medium">
        {t('settings.takbull.api_key')}
        <input
          type="text"
          dir="ltr"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
      </label>

      <label className="block text-sm font-medium">
        {t('settings.takbull.api_secret')}
        <input
          type="password"
          dir="ltr"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={apiSecret}
          onChange={(e) => setApiSecret(e.target.value)}
          autoComplete="new-password"
        />
      </label>

      {message && (
        <p
          className={`text-sm ${message.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={missing || saveMutation.isPending}
          isLoading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {t('settings.takbull.save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!saved || testMutation.isPending}
          isLoading={testMutation.isPending}
          onClick={() => testMutation.mutate()}
        >
          {t('settings.takbull.test')}
        </Button>
      </div>
      {missing && <p className="text-xs text-muted-foreground">{t('settings.takbull.need_both')}</p>}
    </section>
  );
}
