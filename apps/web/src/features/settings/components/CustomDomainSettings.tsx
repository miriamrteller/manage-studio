import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';
import { DNS_PROVIDERS, type DnsProvider, type DomainHints, problemKey, suggestCustomDomain } from '../lib/customDomain';

/** What custom-domain returns for the studio (no Cloudflare ids). */
export interface CustomDomainView {
  id: string;
  hostname: string;
  status: 'pending' | 'active' | 'paused' | 'failed' | 'removed';
  managed_by: 'self_serve' | 'opalswift';
  ssl_status: string | null;
  dns_records: { type: 'CNAME' | 'TXT'; name: string; value: string; purpose: 'route' | 'ownership' | 'certificate' }[];
  error_code: string | null;
  auto_check_until: string | null;
  last_checked_at: string | null;
  activated_at: string | null;
  delete_after: string | null;
}

type Reply = { domain?: CustomDomainView | null; enabled?: boolean; error?: string; code?: string };

async function callFunction(body: Record<string, unknown>): Promise<Reply> {
  const { data, error } = await supabase.functions.invoke('custom-domain', { body });
  const parsed = (await parseFunctionInvokeBody(data, error)) as Reply | null;
  if (!parsed) throw new Error('cloudflare_unavailable');
  return parsed;
}

/** Whether this studio is in the custom-domain rollout (its own admins only). */
export function useCustomDomainEnabled(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['custom-domain-enabled', tenantId],
    queryFn: async () => {
      const { data } = await supabase.rpc('custom_domain_enabled', { p_tenant_id: tenantId! });
      return data === true;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  });
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function RecordsTable({ records }: { records: CustomDomainView['dns_records'] }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-gray-200 rounded">
        <caption className="sr-only">{t('settings.custom_domain.records_caption')}</caption>
        <thead className="bg-gray-50 text-start">
          <tr>
            <th scope="col" className="p-2 text-start">{t('settings.custom_domain.col_type')}</th>
            <th scope="col" className="p-2 text-start">{t('settings.custom_domain.col_name')}</th>
            <th scope="col" className="p-2 text-start">{t('settings.custom_domain.col_value')}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const key = `${r.type}:${r.name}`;
            return (
              <tr key={key} className="border-t border-gray-200 align-top">
                <td className="p-2 font-mono" dir="ltr">{r.type}</td>
                <td className="p-2">
                  <code className="break-all" dir="ltr">{r.name}</code>
                  <p className="text-xs text-muted-foreground">{t(`settings.custom_domain.purpose.${r.purpose}`)}</p>
                </td>
                <td className="p-2">
                  <code className="break-all" dir="ltr">{r.value}</code>
                  <div>
                    <button
                      type="button"
                      className="text-xs text-indigo-700 underline"
                      onClick={async () => {
                        if (await copyText(r.value)) setCopied(key);
                      }}
                    >
                      {copied === key ? t('settings.custom_domain.copied') : t('settings.custom_domain.copy')}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProviderHelp() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<DnsProvider>('cloudflare');
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" htmlFor="custom-domain-provider">
        {t('settings.custom_domain.provider_label')}
      </label>
      <select
        id="custom-domain-provider"
        className="form-select"
        value={provider}
        onChange={(e) => setProvider(e.target.value as DnsProvider)}
      >
        {DNS_PROVIDERS.map((p) => (
          <option key={p} value={p}>{t(`settings.custom_domain.providers.${p}.name`)}</option>
        ))}
      </select>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t(`settings.custom_domain.providers.${provider}.steps`)}
      </p>
    </div>
  );
}

/**
 * Settings → Custom domain (self-serve). Shown only to studios in the rollout;
 * others keep the read-only field in SchoolProfileForm.
 */
export function CustomDomainSettings() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const qc = useQueryClient();
  const enabled = useCustomDomainEnabled(tenant?.id);
  const [hostname, setHostname] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['custom-domain', tenant?.id],
    queryFn: () => callFunction({ action: 'status' }),
    enabled: enabled.data === true,
  });
  const domain = statusQuery.data?.domain ?? null;

  useEffect(() => {
    if (!hostname && tenant) setHostname(suggestCustomDomain(tenant as unknown as DomainHints));
    // only once, when the studio loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id]);

  const run = useMutation({
    mutationFn: (body: Record<string, unknown>) => callFunction(body),
    onSuccess: (reply) => {
      if (reply.error) {
        setMessage(t(problemKey(reply.code ?? reply.error) ?? 'settings.custom_domain.codes.unknown'));
        return;
      }
      setMessage(null);
      setConfirm('');
      qc.setQueryData(['custom-domain', tenant?.id], { domain: reply.domain ?? null });
      void qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: () => setMessage(t('settings.custom_domain.codes.cloudflare_unavailable')),
  });

  if (!tenant || enabled.data !== true) return null;

  const live = domain && domain.status !== 'removed' ? domain : null;
  const fmt = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(i18n.language?.startsWith('he') ? 'he-IL' : 'en-GB', { dateStyle: 'medium' }).format(new Date(iso)) : '';
  const problem = live?.error_code ? problemKey(live.error_code) : null;

  return (
    <section className="space-y-4 max-w-2xl" aria-labelledby="custom-domain-title">
      <h2 id="custom-domain-title" className="text-lg font-semibold text-foreground">
        {t('settings.custom_domain.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('settings.custom_domain.description')}</p>

      {!live && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run.mutate({ action: 'request', hostname });
          }}
        >
          <label className="block text-sm font-medium" htmlFor="custom-domain-input">
            {t('settings.custom_domain.input_label')}
          </label>
          <input
            id="custom-domain-input"
            type="text"
            dir="ltr"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            className="form-input w-full"
            placeholder="app.yourstudio.com"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            aria-describedby="custom-domain-input-hint"
          />
          <p id="custom-domain-input-hint" className="text-xs text-muted-foreground">
            {t('settings.custom_domain.input_hint')}
          </p>
          <Button type="submit" variant="primary" disabled={run.isPending || !hostname.trim()}>
            {t('settings.custom_domain.connect')}
          </Button>
        </form>
      )}

      {live && live.managed_by === 'opalswift' && (
        <p className="text-sm" role="status">
          {live.status === 'active'
            ? t('settings.custom_domain.managed_connected', { hostname: live.hostname })
            : t('settings.custom_domain.managed_pending', { hostname: live.hostname })}
        </p>
      )}

      {live && live.managed_by === 'self_serve' && (
        <div className="space-y-4">
          <p className="text-sm font-medium" role="status">
            <span dir="ltr">{live.hostname}</span>
            {' · '}
            {live.status === 'active' && t('settings.custom_domain.status_active')}
            {live.status === 'pending' && t('settings.custom_domain.status_pending')}
            {live.status === 'paused' && t('settings.custom_domain.status_paused')}
            {live.status === 'failed' && t('settings.custom_domain.status_failed')}
          </p>

          {live.status !== 'active' && (
            <>
              <p className="text-sm">{t('settings.custom_domain.records_intro')}</p>
              <RecordsTable records={live.dns_records} />
              <ProviderHelp />
              {problem && <p className="text-sm text-amber-800">{t(problem)}</p>}
              {live.delete_after && (
                <p className="text-xs text-muted-foreground">
                  {t('settings.custom_domain.delete_after', { date: fmt(live.delete_after) })}
                </p>
              )}
              <Button variant="primary" disabled={run.isPending} onClick={() => run.mutate({ action: 'check' })}>
                {t('settings.custom_domain.check_now')}
              </Button>
            </>
          )}

          {live.status === 'active' && live.activated_at && (
            <p className="text-sm text-muted-foreground">
              {t('settings.custom_domain.active_since', { date: fmt(live.activated_at) })}
            </p>
          )}

          <div className="space-y-2 border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium" htmlFor="custom-domain-confirm">
              {t('settings.custom_domain.remove_label', { hostname: live.hostname })}
            </label>
            <input
              id="custom-domain-confirm"
              type="text"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              className="form-input w-full"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={run.isPending || confirm.trim().toLowerCase() !== live.hostname}
              onClick={() => run.mutate({ action: 'remove', confirmHostname: confirm })}
            >
              {t('settings.custom_domain.remove')}
            </Button>
            <p className="text-xs text-muted-foreground">{t('settings.custom_domain.remove_hint')}</p>
          </div>
        </div>
      )}

      {message && (
        <p className="text-sm text-amber-800" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}
