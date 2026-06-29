import { useState } from 'react';

import { useTranslation } from 'react-i18next';

import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';

import { supabase } from '@/lib/supabase';

import { useTenant } from '@/hooks/useTenant';

import queryClient from '@/lib/query-client';

import { FinanceHealthCard } from '@/features/finance/components/FinanceHealthCard';



function StatusRow({ label, value }: { label: string; value: string }) {

  return (

    <div className="flex justify-between gap-4">

      <dt className="text-muted-foreground">{label}</dt>

      <dd>{value}</dd>

    </div>

  );

}



/**

 * Manual iCount onboarding — company id, CC page id (`cp`), and API token.

 * Silent provisioning (I6) replaces this as the default path later.

 */

export function IcountSettingsForm({ embedded = false }: { embedded?: boolean }) {

  const { t } = useTranslation();

  const tenant = useTenant();

  const [companyId, setCompanyId] = useState('');

  const [pageId, setPageId] = useState('');

  const [apiToken, setApiToken] = useState('');

  const [message, setMessage] = useState<string | null>(null);



  const trimmedMissing = !companyId.trim() || !pageId.trim() || !apiToken.trim();



  const saveMutation = useMutation({

    mutationFn: async () => {

      const { error } = await supabase.rpc('save_tenant_icount_credentials', {

        p_company_id: companyId.trim(),

        p_page_id: pageId.trim(),

        p_api_token: apiToken.trim(),

      });

      if (error) throw error;

    },

    onSuccess: async () => {

      setApiToken('');

      setMessage(t('settings.icount.saved', { defaultValue: 'iCount credentials saved.' }));

      await queryClient.invalidateQueries({ queryKey: ['tenant'] });

    },

    onError: (err: Error) => setMessage(err.message),

  });



  return (

    <section className="space-y-4 max-w-lg">

      {!embedded && (
        <>
          <h2 className="text-lg font-semibold text-foreground">

            {t('settings.icount.title', { defaultValue: 'Payments & invoices (iCount)' })}

          </h2>

          <p className="text-sm text-muted-foreground">

            {t('settings.icount.description', {

              defaultValue:

                'iCount captures card payments and issues the tax document together. Enter your iCount company id, CC page id, and API token.',

            })}

          </p>
        </>
      )}



      <dl className="text-sm space-y-2">

        <StatusRow

          label={t('settings.icount.provider', { defaultValue: 'Provider' })}

          value={tenant?.payment_provider ?? 'icount'}

        />

        <StatusRow

          label={t('settings.icount.api_token_status', { defaultValue: 'API token' })}

          value={

            tenant?.payment_provider_secret_configured

              ? t('settings.icount.configured', { defaultValue: 'Configured' })

              : t('settings.icount.not_configured', { defaultValue: 'Not configured' })

          }

        />

      </dl>



      <label className="block text-sm font-medium">

        {t('settings.icount.company_id', { defaultValue: 'Company id (cid)' })}

        <input

          type="text"

          className="mt-1 w-full border border-border rounded px-3 py-2"

          value={companyId}

          onChange={(e) => setCompanyId(e.target.value)}

          autoComplete="off"

        />

      </label>



      <label className="block text-sm font-medium">

        {t('settings.icount.page_id', { defaultValue: 'CC page id (cp)' })}

        <input

          type="text"

          className="mt-1 w-full border border-border rounded px-3 py-2"

          value={pageId}

          onChange={(e) => setPageId(e.target.value)}

          placeholder={tenant?.payment_provider_public_key ?? ''}

          autoComplete="off"

        />

      </label>



      <label className="block text-sm font-medium">

        {t('settings.icount.api_token', { defaultValue: 'API token' })}

        <input

          type="password"

          className="mt-1 w-full border border-border rounded px-3 py-2"

          value={apiToken}

          onChange={(e) => setApiToken(e.target.value)}

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



      <FinanceHealthCard provider="icount" />

    </section>

  );

}

