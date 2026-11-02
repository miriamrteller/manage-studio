import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';
import { functionInvokeErrorMessage, parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';
import { isProviderSwitchBlockedError } from '@/lib/providerPairing';

/** The platform's encryption key is not set, so nothing can be stored or read back. */
export function isEncryptionKeyMissing(message: string | null | undefined): boolean {
  return /encryption_key|encryption key/i.test(message ?? '');
}

/**
 * Settings -> Payment for a studio on YPay: its own client ID and client secret (not the
 * generic card-provider boxes), a Test connection button, and an explicit "which document does
 * YPay issue" choice (108 receipt / 109 invoice-receipt). The document choice is never inferred
 * from business status.
 */
export function YpaySettingsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [docMessage, setDocMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const friendly = (raw: string) =>
    isEncryptionKeyMissing(raw)
      ? t('settings.ypay.encryption_missing')
      : isProviderSwitchBlockedError({ message: raw })
        ? t('settings.offline_payments.switch_contact_support')
        : raw;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('save_tenant_ypay_credentials', {
        p_client_id: clientId.trim(),
        p_client_secret: clientSecret.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setClientSecret('');
      setMessage({ kind: 'ok', text: t('settings.ypay.saved') });
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (err: Error) => setMessage({ kind: 'error', text: friendly(err.message) }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('verify-ypay-credentials');
      const body = await parseFunctionInvokeBody(data, error);
      if (body?.valid === true) return;
      throw new Error(functionInvokeErrorMessage(error, body, t('settings.ypay.test_failed')));
    },
    onSuccess: () => setMessage({ kind: 'ok', text: t('settings.ypay.test_ok') }),
    onError: (err: Error) => setMessage({ kind: 'error', text: friendly(err.message) }),
  });

  const docQuery = useQuery({
    queryKey: ['ypay-document-type', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('ypay_document_type')
        .eq('id', tenant!.id)
        .single();
      if (error) throw error;
      return Number(data?.ypay_document_type) === 108 ? 108 : 109;
    },
  });

  const docMutation = useMutation({
    mutationFn: async (value: 108 | 109) => {
      const { error } = await supabase.from('tenants').update({ ypay_document_type: value }).eq('id', tenant!.id);
      if (error) throw error;
      return value;
    },
    onSuccess: async () => {
      setDocMessage({ kind: 'ok', text: t('settings.ypay.document_saved') });
      await queryClient.invalidateQueries({ queryKey: ['ypay-document-type'] });
    },
    onError: (err: Error) => setDocMessage({ kind: 'error', text: err.message }),
  });

  const missing = !clientId.trim() || !clientSecret.trim();
  const connected = Boolean(tenant?.payment_provider_secret_configured);

  return (
    <div className="space-y-8 max-w-lg">
      <section className="space-y-4" aria-labelledby="ypay-connect-title">
        <h2 id="ypay-connect-title" className="text-lg font-semibold text-foreground">
          {t('settings.ypay.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('settings.ypay.hint')}</p>
        <p className="text-sm" role="status">
          {connected ? t('settings.ypay.connected') : t('settings.ypay.not_connected')}
        </p>

        <label className="block text-sm font-medium">
          {t('settings.ypay.client_id')}
          <input
            type="text"
            dir="ltr"
            className="mt-1 w-full border border-border rounded px-3 py-2"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={tenant?.payment_provider_public_key ?? ''}
            autoComplete="off"
          />
        </label>

        <label className="block text-sm font-medium">
          {t('settings.ypay.client_secret')}
          <input
            type="password"
            dir="ltr"
            className="mt-1 w-full border border-border rounded px-3 py-2"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
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
            {t('settings.ypay.save')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!connected || testMutation.isPending}
            isLoading={testMutation.isPending}
            onClick={() => testMutation.mutate()}
          >
            {t('settings.ypay.test')}
          </Button>
        </div>
        {missing && <p className="text-xs text-muted-foreground">{t('settings.ypay.need_both')}</p>}
      </section>

      <section className="space-y-2" aria-labelledby="ypay-doc-title">
        <h2 id="ypay-doc-title" className="text-lg font-semibold text-foreground">
          {t('settings.ypay.document_title')}
        </h2>
        <label className="block text-sm font-medium" htmlFor="ypay-document-type">
          {t('settings.ypay.document_label')}
        </label>
        <select
          id="ypay-document-type"
          className="form-input w-full"
          aria-describedby="ypay-document-hint"
          value={docQuery.data ?? 109}
          disabled={docQuery.isLoading || docMutation.isPending}
          onChange={(e) => docMutation.mutate(Number(e.target.value) === 108 ? 108 : 109)}
        >
          <option value={108}>{t('settings.ypay.document_108')}</option>
          <option value={109}>{t('settings.ypay.document_109')}</option>
        </select>
        <p id="ypay-document-hint" className="text-xs text-muted-foreground">
          {t('settings.ypay.document_hint')}
        </p>
        {docMessage && (
          <p
            className={`text-sm ${docMessage.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
            role={docMessage.kind === 'error' ? 'alert' : 'status'}
          >
            {docMessage.text}
          </p>
        )}
      </section>
    </div>
  );
}
