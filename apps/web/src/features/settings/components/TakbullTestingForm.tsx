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
  const [justSaved, setJustSaved] = useState(false);

  const friendly = (raw: string) => (isEncryptionKeyMissing(raw) ? t('settings.takbull.encryption_missing') : raw);

  // Asked of the server (no Takbull call): a studio can't read the keys' row directly on every
  // database, and the page must never say "no keys" when keys are saved.
  const status = useQuery({
    queryKey: ['takbull-credentials-status', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('verify-takbull-credentials', {
        body: { action: 'status' },
      });
      const body = await parseFunctionInvokeBody(data, error);
      if (typeof body?.saved !== 'boolean') throw new Error('status unknown');
      return { saved: body.saved as boolean, savedAt: (body.saved_at as string | null) ?? null };
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
      setJustSaved(true);
      setMessage({ kind: 'ok', text: t('settings.takbull.saved') });
      await queryClient.invalidateQueries({ queryKey: ['takbull-credentials-status'] });
    },
    onError: (err: Error) => setMessage({ kind: 'error', text: friendly(err.message) }),
  });

  const [testReachedKeys, setTestReachedKeys] = useState(false);
  const testMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('verify-takbull-credentials');
      const body = await parseFunctionInvokeBody(data, error);
      if (body?.code === 'not_connected') throw new Error(t('settings.takbull.not_saved'));
      // Any other answer means saved keys were found and sent to Takbull.
      if (body) setTestReachedKeys(true);
      if (body?.valid === true) return;
      throw new Error(functionInvokeErrorMessage(error, body, t('settings.takbull.test_failed')));
    },
    onSuccess: () => setMessage({ kind: 'ok', text: t('settings.takbull.test_ok') }),
    onError: (err: Error) => setMessage({ kind: 'error', text: friendly(err.message) }),
  });

  const missing = !apiKey.trim() || !apiSecret.trim();
  const savedAt = status.data?.savedAt ?? null;
  // "Not saved" only when the server says so; while unknown, the line says nothing wrong.
  const saved = Boolean(status.data?.saved) || justSaved || testReachedKeys;
  const knownNotSaved = status.data?.saved === false && !justSaved && !testReachedKeys;

  return (
    <section className="space-y-4 max-w-lg" aria-labelledby="takbull-testing-title">
      <h2 id="takbull-testing-title" className="text-lg font-semibold text-foreground">
        {t('settings.takbull.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('settings.takbull.hint')}</p>
      <p className="text-sm" role="status">
        {saved && savedAt
          ? t('settings.takbull.saved_on', { date: new Date(savedAt).toLocaleString() })
          : saved
            ? t('settings.takbull.saved')
            : knownNotSaved
              ? t('settings.takbull.not_saved')
              : null}
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
          disabled={testMutation.isPending}
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
