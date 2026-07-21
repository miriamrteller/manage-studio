import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';
import { FinanceHealthCard } from '@/features/finance/components/FinanceHealthCard';
import {
  INVOICE4U_CLEARING_COMPANY_OPTIONS,
  INVOICE4U_DEFAULT_CLEARING_COMPANY,
} from '@/lib/bundledProviderUi';

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * Manual Invoice4U onboarding — org API key + clearing company type (D4).
 */
export function Invoice4uSettingsForm({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [apiKey, setApiKey] = useState('');
  const [clearingCompany, setClearingCompany] = useState(
    tenant?.payment_provider_public_key &&
      INVOICE4U_CLEARING_COMPANY_OPTIONS.some(
        (opt) => opt.value === tenant.payment_provider_public_key,
      )
      ? tenant.payment_provider_public_key
      : INVOICE4U_DEFAULT_CLEARING_COMPANY,
  );
  const [accountLabel, setAccountLabel] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const trimmedMissing = !apiKey.trim() || !clearingCompany.trim();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('save_tenant_invoice4u_credentials', {
        p_api_key: apiKey.trim(),
        p_clearing_company_type: clearingCompany.trim(),
        p_account_label: accountLabel.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setApiKey('');
      setMessage(
        t('settings.invoice4u.saved', { defaultValue: 'Invoice4U credentials saved.' }),
      );
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  return (
    <section className="space-y-4 max-w-lg">
      {!embedded && (
        <>
          <h2 className="text-lg font-semibold text-foreground">
            {t('settings.invoice4u.title', {
              defaultValue: 'Payments & invoices (Invoice4U)',
            })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('settings.invoice4u.description', {
              defaultValue:
                'Invoice4U captures card payments and issues the tax document together. Enter your organisation API key and clearing company.',
            })}
          </p>
        </>
      )}

      <dl className="text-sm space-y-2">
        <StatusRow
          label={t('settings.invoice4u.provider', { defaultValue: 'Provider' })}
          value={tenant?.payment_provider ?? 'invoice4u'}
        />
        <StatusRow
          label={t('settings.invoice4u.api_key_status', { defaultValue: 'API key' })}
          value={
            tenant?.payment_provider_secret_configured
              ? t('settings.invoice4u.configured', { defaultValue: 'Configured' })
              : t('settings.invoice4u.not_configured', { defaultValue: 'Not configured' })
          }
        />
      </dl>

      <label className="block text-sm font-medium">
        {t('settings.invoice4u.api_key', { defaultValue: 'Organisation API key' })}
        <input
          type="password"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="new-password"
        />
      </label>

      <label className="block text-sm font-medium">
        {t('settings.invoice4u.clearing_company', { defaultValue: 'Clearing company' })}
        <select
          className="mt-1 w-full border border-border rounded px-3 py-2 bg-background"
          value={clearingCompany}
          onChange={(e) => setClearingCompany(e.target.value)}
        >
          {INVOICE4U_CLEARING_COMPANY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey, { defaultValue: opt.defaultLabel })}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium">
        {t('settings.invoice4u.account_label', {
          defaultValue: 'Account label (optional)',
        })}
        <input
          type="text"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={accountLabel}
          onChange={(e) => setAccountLabel(e.target.value)}
          autoComplete="off"
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

      <FinanceHealthCard provider="invoice4u" />
    </section>
  );
}
