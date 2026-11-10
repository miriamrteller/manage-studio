import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import queryClient from '@/lib/query-client';
import { isDevSite } from '@/lib/devStudioPicker';
import { functionInvokeErrorMessage, parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';

/**
 * /platform/billing, dev website only (step B1 of OpalSwift's own billing,
 * docs/plans/TAKBULL-INTEGRATION.md). The platform owner saves and tests OpalSwift's own
 * Takbull keys, switches the monthly charge on or off (step B3), sees each studio's billing
 * details, and can charge one studio now to test it.
 */
export function PlatformBilling() {
  const { t } = useTranslation();
  if (!isDevSite()) {
    return <p className="text-sm text-muted-foreground">{t('platform_billing.dev_only')}</p>;
  }
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t('platform_billing.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('platform_billing.intro')}</p>
      </div>
      <PlatformKeys />
      <StudiosBilling />
    </div>
  );
}

type Status = { keys_saved: boolean; keys_saved_at: string | null; charging_enabled: boolean };

function PlatformKeys() {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const status = useQuery({
    queryKey: ['platform-billing-status'],
    queryFn: async (): Promise<Status | null> => {
      const { data, error } = await supabase.rpc('platform_billing_status');
      if (error) throw error;
      return ((data as Status[] | null) ?? [])[0] ?? null;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('save_platform_takbull_credentials', {
        p_api_key: apiKey.trim(),
        p_api_secret: apiSecret.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setApiKey('');
      setApiSecret('');
      setMessage({ kind: 'ok', text: t('platform_billing.saved') });
      await queryClient.invalidateQueries({ queryKey: ['platform-billing-status'] });
    },
    onError: (err: Error) => setMessage({ kind: 'error', text: err.message }),
  });

  const test = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('verify-takbull-credentials', {
        body: { scope: 'platform' },
      });
      const body = await parseFunctionInvokeBody(data, error);
      if (body?.code === 'not_connected') throw new Error(t('platform_billing.not_saved'));
      if (body?.valid === true) return;
      throw new Error(functionInvokeErrorMessage(error, body, t('platform_billing.test_failed')));
    },
    onSuccess: () => setMessage({ kind: 'ok', text: t('platform_billing.test_ok') }),
    onError: (err: Error) => setMessage({ kind: 'error', text: err.message }),
  });

  const s = status.data;
  const missing = !apiKey.trim() || !apiSecret.trim();

  return (
    <section className="space-y-4 max-w-lg" aria-labelledby="platform-keys-title">
      <h2 id="platform-keys-title" className="text-lg font-semibold">{t('platform_billing.keys_title')}</h2>
      <p className="text-sm text-muted-foreground">{t('platform_billing.keys_hint')}</p>
      <p className="text-sm" role="status">
        {s?.keys_saved && s.keys_saved_at
          ? t('platform_billing.saved_on', { date: new Date(s.keys_saved_at).toLocaleString() })
          : s && !s.keys_saved
            ? t('platform_billing.not_saved')
            : null}
      </p>
      {s && <ChargingSwitch enabled={s.charging_enabled} />}

      <label className="block text-sm font-medium">
        {t('platform_billing.api_key')}
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
        {t('platform_billing.api_secret')}
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
          disabled={missing || save.isPending}
          isLoading={save.isPending}
          onClick={() => save.mutate()}
        >
          {s?.keys_saved ? t('platform_billing.replace') : t('platform_billing.save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={test.isPending}
          isLoading={test.isPending}
          onClick={() => test.mutate()}
        >
          {t('platform_billing.test')}
        </Button>
      </div>
    </section>
  );
}

function ChargingSwitch({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_platform_charging', { p_enabled: !enabled });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-billing-status'] }),
  });
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        <span>{enabled ? t('platform_billing.charging_on') : t('platform_billing.charging_off')}</span>{' '}
        <span>{t('platform_billing.charging_hint')}</span>
      </p>
      {toggle.isError && <p role="alert" className="text-sm text-destructive">{t('platform_billing.charging_failed')}</p>}
      <Button
        type="button"
        variant="outline"
        disabled={toggle.isPending}
        isLoading={toggle.isPending}
        onClick={() => toggle.mutate()}
      >
        {enabled ? t('platform_billing.charging_turn_off') : t('platform_billing.charging_turn_on')}
      </Button>
    </div>
  );
}

type ChargeResult = { result: string; reason?: string; nextTryOn?: string | null };

function ChargeNow({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const charge = useMutation({
    mutationFn: async (): Promise<ChargeResult | null> => {
      const { data, error } = await supabase.functions.invoke('run-platform-billing', { body: { tenant_id: tenantId } });
      const body = await parseFunctionInvokeBody(data, error);
      if (body?.code === 'charging_off') throw new Error(t('platform_billing.charge_off'));
      if (body?.code === 'not_set_up') throw new Error(t('platform_billing.not_saved'));
      if (body?.ok !== true) throw new Error(functionInvokeErrorMessage(error, body, t('platform_billing.charge_failed')));
      const studios = Array.isArray(body.studios) ? (body.studios as ChargeResult[]) : [];
      return studios[0] ?? null;
    },
    onSuccess: async (r) => {
      if (!r) setMessage({ kind: 'error', text: t('platform_billing.charge_no_card') });
      else if (r.result === 'succeeded') setMessage({ kind: 'ok', text: t('platform_billing.charge_succeeded') });
      else if (r.result === 'declined') setMessage({ kind: 'error', text: t('platform_billing.charge_declined') });
      else if (r.result === 'skipped') {
        setMessage({ kind: 'ok', text: t(`platform_billing.skip_${r.reason ?? 'other'}`, { defaultValue: t('platform_billing.skip_other') }) });
      } else if (r.result === 'unclear') setMessage({ kind: 'error', text: t('platform_billing.charge_unclear') });
      else setMessage({ kind: 'error', text: t('platform_billing.charge_failed') });
      await queryClient.invalidateQueries({ queryKey: ['platform-billing-overview'] });
    },
    onError: (err: Error) => setMessage({ kind: 'error', text: err.message }),
  });
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={charge.isPending}
        isLoading={charge.isPending}
        onClick={() => {
          setMessage(null);
          charge.mutate();
        }}
      >
        {t('platform_billing.charge_now')}
      </Button>
      {message && (
        <p
          className={`text-xs ${message.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

type StudioRow = {
  tenant_id: string;
  name: string;
  subdomain: string;
  sub_status: string;
  trial_ends_at: string | null;
  founder: boolean;
  free_until: string | null;
  monthly_amount_agorot: number | null;
  next_charge_on: string | null;
  card_last4: string | null;
  failed_attempts: number;
  last_paid_month: string | null;
};

function StudiosBilling() {
  const { t } = useTranslation();
  const rows = useQuery({
    queryKey: ['platform-billing-overview'],
    queryFn: async (): Promise<StudioRow[]> => {
      const { data, error } = await supabase.rpc('platform_billing_overview');
      if (error) throw error;
      return (data as StudioRow[] | null) ?? [];
    },
  });
  const date = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '–');
  const statusLabel = (s: string) =>
    t(`platform_welcome.status_${s}`, { defaultValue: s });

  return (
    <section className="space-y-3" aria-labelledby="studios-billing-title">
      <h2 id="studios-billing-title" className="text-lg font-semibold">{t('platform_billing.studios_title')}</h2>
      {rows.isError && <p role="alert" className="text-sm text-destructive">{t('platform_billing.load_failed')}</p>}
      {rows.data && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-start border-b border-border">
                <th scope="col" className="py-2 pe-4 text-start">{t('platform_billing.col_studio')}</th>
                <th scope="col" className="py-2 pe-4 text-start">{t('platform_billing.col_status')}</th>
                <th scope="col" className="py-2 pe-4 text-start">{t('platform_billing.col_trial_ends')}</th>
                <th scope="col" className="py-2 pe-4 text-start">{t('platform_billing.col_card')}</th>
                <th scope="col" className="py-2 pe-4 text-start">{t('platform_billing.col_next_charge')}</th>
                <th scope="col" className="py-2 pe-4 text-start">{t('platform_billing.col_last_paid')}</th>
                <th scope="col" className="py-2 pe-4 text-start">{t('platform_billing.col_test')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.data.map((r) => (
                <tr key={r.tenant_id} className="border-b border-border">
                  <td className="py-2 pe-4">
                    {r.name}
                    {r.founder && <span className="ms-2 text-xs text-muted-foreground">{t('platform_billing.founder')}</span>}
                  </td>
                  <td className="py-2 pe-4">{statusLabel(r.sub_status)}</td>
                  <td className="py-2 pe-4">{date(r.trial_ends_at)}</td>
                  <td className="py-2 pe-4" dir="ltr">{r.card_last4 ? `•••• ${r.card_last4}` : t('platform_billing.no_card')}</td>
                  <td className="py-2 pe-4">{date(r.next_charge_on)}</td>
                  <td className="py-2 pe-4">
                    {date(r.last_paid_month)}
                    {r.failed_attempts > 0 && (
                      <span className="block text-xs text-destructive">
                        {t('platform_billing.failed_attempts', { count: r.failed_attempts })}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pe-4">{r.card_last4 ? <ChargeNow tenantId={r.tenant_id} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
