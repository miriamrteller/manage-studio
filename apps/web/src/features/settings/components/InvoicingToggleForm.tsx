import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';
import { invoicingOptionsFor, invoicingPairsWithPayment } from '@/lib/providerPairing';

/**
 * Every provider a studio may have stored. Only those that work with the studio's payment
 * provider are offered (lib/providerPairing.ts); Yesh and Tranzila are not offered until built.
 */
export const INVOICING_ON_PROVIDERS = ['grow', 'icount', 'invoice4u', 'ypay', 'tranzila', 'yesh', 'green_invoice'] as const;
type InvoicingOnProvider = (typeof INVOICING_ON_PROVIDERS)[number];

export const INVOICING_OFF = 'none';

function isOnProvider(value: string | null | undefined): value is InvoicingOnProvider {
  return (INVOICING_ON_PROVIDERS as readonly string[]).includes(value ?? '');
}

/**
 * Pure: the providers to list for this payment provider. The saved one is kept in the list
 * even if it no longer fits, so the form shows what is stored (saving it is refused).
 */
export function invoicingChoicesFor(paymentProvider: string | null, current: string): string[] {
  const choices = invoicingOptionsFor(paymentProvider ?? '').filter((slug) => slug !== INVOICING_OFF);
  return isOnProvider(current) && !choices.includes(current) ? [current, ...choices] : choices;
}

export type GreenInvoiceDocumentType = 400 | 320;

/**
 * Pure: the Green Invoice document a business status suggests. Exempt dealers and studios not
 * yet registered issue a receipt (400); licensed dealers and companies a tax invoice-receipt
 * (320). Same mapping as private.green_invoice_type_for_status. [[ACCOUNTANT: confirm]]
 */
export function suggestedGreenInvoiceDocumentType(businessStatus: string | null | undefined): GreenInvoiceDocumentType {
  return businessStatus === 'osek_patur' || businessStatus === 'not_registered' ? 400 : 320;
}

/**
 * Pure: what the "Which document does Green Invoice issue?" choice starts on. A studio already
 * on Green Invoice sees its saved choice; one switching to it gets the suggestion from its
 * business status. Business status never changes a saved choice.
 */
export function initialGreenInvoiceDocumentType(input: {
  currentProvider: string | null | undefined;
  saved: number | null | undefined;
  businessStatus: string | null | undefined;
}): GreenInvoiceDocumentType {
  if (input.currentProvider === 'green_invoice') return Number(input.saved) === 400 ? 400 : 320;
  return suggestedGreenInvoiceDocumentType(input.businessStatus);
}

/** Pure: the slug to store for a given toggle state. */
export function resolveInvoicingProviderToSave(input: {
  enabled: boolean;
  selectedProvider: string;
}): string {
  return input.enabled ? input.selectedProvider : INVOICING_OFF;
}

/**
 * Admin → Setup → Settings: "Tax documents". Off = tenants.invoicing_provider 'none' and no
 * document is ever enqueued. On = the chosen provider; credentials live on the invoicing page.
 */
export function InvoicingToggleForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const current = tenant?.invoicing_provider ?? 'grow';
  const paymentProvider = tenant?.payment_provider ?? null;
  const [enabled, setEnabled] = useState(current !== INVOICING_OFF);
  const choices = invoicingChoicesFor(paymentProvider, current);
  const [selectedProvider, setSelectedProvider] = useState<string>(
    isOnProvider(current) ? current : choices[0] ?? 'green_invoice',
  );
  const pairingProblem = enabled && !invoicingPairsWithPayment(paymentProvider ?? '', selectedProvider);
  const [message, setMessage] = useState<string | null>(null);

  const docQuery = useQuery({
    queryKey: ['green-invoice-document-type', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('green_invoice_document_type, legal_profile')
        .eq('id', tenant!.id)
        .single();
      if (error) throw error;
      const profile = (data?.legal_profile ?? {}) as { business_status?: string | null };
      return {
        saved: Number(data?.green_invoice_document_type) === 400 ? 400 : 320,
        businessStatus: profile.business_status ?? null,
      } as { saved: GreenInvoiceDocumentType; businessStatus: string | null };
    },
  });
  const [giType, setGiType] = useState<GreenInvoiceDocumentType | null>(null);
  const giTypeShown =
    giType ??
    initialGreenInvoiceDocumentType({
      currentProvider: current,
      saved: docQuery.data?.saved,
      businessStatus: docQuery.data?.businessStatus,
    });
  const suggestion = docQuery.data ? suggestedGreenInvoiceDocumentType(docQuery.data.businessStatus) : null;
  const showGiDocument = enabled && selectedProvider === 'green_invoice';

  // Depend on the saved slug, not the tenant object, so a refetch does not reset the form.
  useEffect(() => {
    setEnabled(current !== INVOICING_OFF);
    if (isOnProvider(current)) setSelectedProvider(current);
  }, [current]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant not loaded');
      if (pairingProblem) throw new Error(t('settings.invoicing_toggle.pairing_problem'));
      const provider = resolveInvoicingProviderToSave({ enabled, selectedProvider });
      const { error } = await supabase
        .from('tenants')
        .update({
          invoicing_provider: provider,
          ...(provider === 'green_invoice' ? { green_invoice_document_type: giTypeShown } : {}),
        })
        .eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage(t('settings.invoicing_toggle.saved'));
      setGiType(null);
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
      await queryClient.invalidateQueries({ queryKey: ['green-invoice-document-type'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  if (!tenant) return null;

  return (
    <section className="space-y-4 max-w-lg" aria-labelledby="invoicing-toggle-title">
      <h2 id="invoicing-toggle-title" className="text-lg font-semibold text-foreground">
        {t('settings.invoicing_toggle.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('settings.invoicing_toggle.description')}</p>

      <div className="flex items-start gap-2 text-sm">
        <input
          id="invoicing-toggle-enabled"
          type="checkbox"
          className="mt-1"
          checked={enabled}
          aria-describedby="invoicing-toggle-enabled-hint"
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <div>
          <label htmlFor="invoicing-toggle-enabled" className="font-medium">
            {t('settings.invoicing_toggle.enabled_label')}
          </label>
          <p id="invoicing-toggle-enabled-hint" className="text-muted-foreground">
            {t('settings.invoicing_toggle.enabled_hint')}
          </p>
        </div>
      </div>

      {enabled ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="invoicing-toggle-provider">
            {t('settings.invoicing.provider')}
          </label>
          <select
            id="invoicing-toggle-provider"
            className="form-input w-full"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
          >
            {choices.map((slug) => (
              <option key={slug} value={slug}>
                {t(`settings.invoicing_toggle.providers.${slug}`)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t('settings.invoicing_toggle.credentials_hint')}</p>
          {['grow', 'icount', 'invoice4u'].includes(selectedProvider) && (
            <p className="text-sm text-muted-foreground" role="note">
              {t('settings.invoicing_toggle.cash_receipts_hint', {
                provider: t(`settings.invoicing_toggle.providers.${selectedProvider}`),
              })}
            </p>
          )}
          {showGiDocument && (
            <div className="space-y-1 pt-2">
              <label className="block text-sm font-medium" htmlFor="gi-document-type">
                {t('settings.invoicing_toggle.gi_document_label')}
              </label>
              <select
                id="gi-document-type"
                className="form-input w-full"
                aria-describedby="gi-document-hint"
                value={giTypeShown}
                disabled={docQuery.isLoading}
                onChange={(e) => setGiType(Number(e.target.value) === 400 ? 400 : 320)}
              >
                <option value={400}>{t('settings.invoicing_toggle.gi_document_400')}</option>
                <option value={320}>{t('settings.invoicing_toggle.gi_document_320')}</option>
              </select>
              <p id="gi-document-hint" className="text-xs text-muted-foreground">
                {t('settings.invoicing_toggle.gi_document_hint')}
              </p>
              {suggestion !== null && giTypeShown !== suggestion && (
                <p className="text-sm text-muted-foreground" role="note">
                  {t(suggestion === 400 ? 'settings.invoicing_toggle.gi_document_differs_400' : 'settings.invoicing_toggle.gi_document_differs_320')}
                </p>
              )}
            </div>
          )}
          {pairingProblem && (
            <p className="text-sm text-destructive" role="alert">
              {t('settings.invoicing_toggle.pairing_problem')}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm rounded-lg border border-border bg-muted/40 px-3 py-2" role="note">
          {t('settings.invoicing_toggle.off_note')}
        </p>
      )}

      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}

      <Button
        type="button"
        variant="primary"
        disabled={saveMutation.isPending || pairingProblem}
        isLoading={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {t('common.save')}
      </Button>
    </section>
  );
}
