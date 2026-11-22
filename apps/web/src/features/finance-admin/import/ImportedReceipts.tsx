import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@shared/format';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import {
  ImportedReceiptsService,
  OFFLINE_METHODS,
  guessClient,
  offlineMethodFromSheet,
  rowState,
  type ImportedIncome,
  type OfflineMethod,
  type SendRefusal,
  type SendResult,
} from './importedReceipts';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Finance -> Import: imported payments that have no receipt yet. "Send receipt" turns the row
 * into a payment recorded by hand and the studio's invoicing service issues the receipt, with
 * everything from the row. Rows with a receipt from the old system are never offered one.
 */
export function ImportedReceipts() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const currency = tenant?.currency ?? 'ILS';
  const receiptsOff = (tenant?.invoicing_provider ?? 'none') === 'none';

  const rowsQuery = useQuery({
    queryKey: ['imported-income', tenant?.id],
    queryFn: () => ImportedReceiptsService.list(tenant!.id),
    enabled: !!tenant?.id,
  });
  const clientsQuery = useQuery({
    queryKey: ['imported-income-clients', tenant?.id],
    queryFn: () => ImportedReceiptsService.clients(tenant!.id),
    enabled: !!tenant?.id,
  });

  const [emails, setEmails] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<Record<string, OfflineMethod>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refusals, setRefusals] = useState<Record<string, SendRefusal>>({});
  const [summary, setSummary] = useState<{ sent: number; failed: number } | null>(null);

  const rows = useMemo(() => rowsQuery.data ?? [], [rowsQuery.data]);
  const open = rows.filter((r) => rowState(r) === 'needs_receipt');
  const sent = rows.filter((r) => rowState(r) === 'sent');
  const oldReceipts = rows.filter((r) => rowState(r) === 'old_receipt');

  // Prefilled: the row's email, else the one clear client match (editable).
  const prefilled = useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of open) {
      out[r.id] = r.payer_email ?? guessClient(r, clientsQuery.data ?? [])?.email ?? '';
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, clientsQuery.data]);

  const emailFor = (r: ImportedIncome) => (emails[r.id] ?? prefilled[r.id] ?? '').trim().toLowerCase();
  const methodFor = (r: ImportedIncome) => methods[r.id] ?? offlineMethodFromSheet(r.payment_method);
  const ready = (r: ImportedIncome) => EMAIL_RE.test(emailFor(r)) && !!methodFor(r) && !!r.payer_name?.trim();

  const sendMutation = useMutation({
    mutationFn: (list: ImportedIncome[]) =>
      ImportedReceiptsService.send(
        list.map((r) => ({ income_id: r.id, email: emailFor(r), method: methodFor(r) ?? undefined })),
      ),
    onSuccess: async (results: SendResult[]) => {
      const next: Record<string, SendRefusal> = {};
      for (const r of results) if (!r.ok) next[r.income_id] = r.reason;
      setRefusals((prev) => ({ ...prev, ...next }));
      setSummary({ sent: results.filter((r) => r.ok).length, failed: Object.keys(next).length });
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ['imported-income'] });
      await queryClient.invalidateQueries({ queryKey: ['imported-income-clients'] });
    },
  });

  if (!rowsQuery.data || rows.length === 0) return null;

  const money = (minor: number) => formatCurrency(minor, currency, i18n.language);
  const date = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(i18n.language);
  const selectable = open.filter(ready);
  const selectedRows = open.filter((r) => selected.has(r.id) && ready(r));
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const busy = sendMutation.isPending;

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <section className="space-y-3" aria-labelledby="imported-receipts-title">
      <h2 id="imported-receipts-title" className="text-xl font-semibold">
        {t('finance.import.receipts.title')}
      </h2>
      <p className="text-sm text-gray-600">{t('finance.import.receipts.intro')}</p>

      {receiptsOff && (
        <p className="rounded border border-border bg-muted/40 px-3 py-2 text-sm" role="note">
          {t('finance.import.receipts.off_note')}{' '}
          <Link to="/admin/settings?tab=invoicing" className="font-medium text-primary underline">
            {t('finance.import.receipts.off_link')}
          </Link>
        </p>
      )}

      {sendMutation.error && (
        <div className="alert-error" role="alert">
          {sendMutation.error.message === 'receipts_unavailable'
            ? t('finance.import.receipts.unavailable')
            : sendMutation.error.message}
        </div>
      )}
      {summary && (
        <p className="text-sm" role="status">
          {t('finance.import.receipts.summary_sent', { count: summary.sent })}
          {summary.failed > 0 && ` ${t('finance.import.receipts.summary_failed', { count: summary.failed })}`}
        </p>
      )}

      {open.length === 0 ? (
        <p className="text-sm text-gray-600">{t('finance.import.receipts.none_open')}</p>
      ) : (
        <>
          {!receiptsOff && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={selectable.length === 0 || busy}
                  onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((r) => r.id)) : new Set())}
                />
                {t('finance.import.receipts.select_all', { count: selectable.length })}
              </label>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={selectedRows.length === 0 || busy}
                isLoading={busy && (sendMutation.variables?.length ?? 0) > 1}
                onClick={() => sendMutation.mutate(selectedRows)}
              >
                {t('finance.import.receipts.send_selected', { count: selectedRows.length })}
              </Button>
            </div>
          )}

          <ul className="space-y-2 text-sm">
            {open.map((r) => {
              const method = methodFor(r);
              const refusal = refusals[r.id];
              const isSending = busy && sendMutation.variables?.some((v) => v.id === r.id);
              return (
                <li key={r.id} className="flex flex-wrap items-end gap-3 rounded border p-3">
                  {!receiptsOff && (
                    <input
                      type="checkbox"
                      className="mb-2"
                      aria-label={t('finance.import.receipts.select_row', { name: r.payer_name ?? '' })}
                      checked={selected.has(r.id)}
                      disabled={!ready(r) || busy}
                      onChange={(e) => toggle(r.id, e.target.checked)}
                    />
                  )}
                  <div className="min-w-[12rem] flex-1">
                    <p className="font-medium" dir="auto">
                      {r.payer_name ?? t('finance.import.receipts.no_name')}
                    </p>
                    <p className="text-gray-600" dir="auto">
                      {[date(r.income_date), money(r.amount_minor), r.job_name].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs text-gray-600">{t('finance.import.receipts.method')}</span>
                    <select
                      className="form-input"
                      value={method ?? ''}
                      disabled={receiptsOff || busy}
                      onChange={(e) => setMethods((prev) => ({ ...prev, [r.id]: e.target.value as OfflineMethod }))}
                    >
                      {!method && <option value="">{t('finance.import.receipts.method_choose', { value: r.payment_method ?? '' })}</option>}
                      {OFFLINE_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {t(`finance.import.receipts.methods.${m}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-[14rem] flex-1">
                    <span className="mb-1 block text-xs text-gray-600">{t('finance.import.receipts.email')}</span>
                    <input
                      type="email"
                      className="form-input w-full"
                      dir="ltr"
                      value={emails[r.id] ?? prefilled[r.id] ?? ''}
                      disabled={receiptsOff || busy}
                      onChange={(e) => setEmails((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    />
                  </label>
                  {!receiptsOff && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!ready(r) || busy}
                      isLoading={isSending && sendMutation.variables?.length === 1}
                      onClick={() => sendMutation.mutate([r])}
                    >
                      {t('finance.import.receipts.send')}
                    </Button>
                  )}
                  {refusal && (
                    <p className="w-full text-destructive" role="alert">
                      {t(`finance.import.receipts.refusal.${refusal}`)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {sent.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            {t('finance.import.receipts.sent_title', { count: sent.length })}
          </summary>
          <ul className="mt-2 space-y-1">
            {sent.map((r) => (
              <li key={r.id} dir="auto">
                {[date(r.income_date), r.payer_name, money(r.amount_minor)].filter(Boolean).join(' · ')} ·{' '}
                {r.payment?.invoice_url ? (
                  <a href={r.payment.invoice_url} target="_blank" rel="noreferrer" className="text-primary underline">
                    {t('finance.import.receipts.receipt_number', { number: r.payment.external_document_number ?? '' })}
                  </a>
                ) : r.payment?.external_document_number ? (
                  t('finance.import.receipts.receipt_number', { number: r.payment.external_document_number })
                ) : (
                  t('finance.import.receipts.on_its_way')
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {oldReceipts.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            {t('finance.import.receipts.old_title', { count: oldReceipts.length })}
          </summary>
          <ul className="mt-2 space-y-1">
            {oldReceipts.map((r) => (
              <li key={r.id} dir="auto">
                {[date(r.income_date), r.payer_name, money(r.amount_minor)].filter(Boolean).join(' · ')} ·{' '}
                {t('finance.import.receipts.old_number', {
                  number: [r.receipt_book, r.receipt_number].filter(Boolean).join('/'),
                })}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
