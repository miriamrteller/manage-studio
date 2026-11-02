import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@shared/format';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';

export interface DocumentNotIssuedRow {
  id: string;
  status: 'not_issued' | 'dead';
  document_kind: 'sale' | 'refund';
  last_error: string | null;
  created_at: string;
  payments: {
    total_amount_minor: number;
    currency: string;
    paid_at: string | null;
    payment_method: string | null;
  } | null;
}

const LIMIT = 20;

/** Queue rows whose document will not come by itself: not issued (no standalone API) or failed. */
export async function fetchDocumentsNotIssued(tenantId: string): Promise<DocumentNotIssuedRow[]> {
  const { data, error } = await supabase
    .from('document_queue')
    .select('id, status, document_kind, last_error, created_at, payments(total_amount_minor, currency, paid_at, payment_method)')
    .eq('tenant_id', tenantId)
    .in('status', ['not_issued', 'dead'])
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as DocumentNotIssuedRow[];
}

/**
 * Finance hub: payments that have no tax document and will not get one by themselves
 * (payments audit P2 #12). Shown to whoever sees the finance page (tenant admins; RLS on
 * document_queue). Hidden when there is nothing to show.
 */
export function DocumentsNotIssuedCard() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const { data: rows = [] } = useQuery({
    queryKey: ['documents-not-issued', tenant?.id],
    queryFn: () => fetchDocumentsNotIssued(tenant!.id),
    enabled: !!tenant?.id,
  });

  if (rows.length === 0) return null;

  const provider = t(`settings.provider_names.${tenant?.invoicing_provider ?? 'none'}`, {
    defaultValue: tenant?.invoicing_provider ?? '',
  });

  return (
    <section
      className="space-y-3 rounded border border-amber-200 bg-amber-50 p-4"
      aria-labelledby="documents-not-issued-title"
    >
      <h3 id="documents-not-issued-title" className="text-lg font-semibold text-amber-900">
        {t('finance.documents_not_issued.title')}
      </h3>
      <p className="text-sm text-amber-900">{t('finance.documents_not_issued.description')}</p>
      <ul className="space-y-2 text-sm">
        {rows.map((row) => {
          const payment = row.payments;
          const when = payment?.paid_at ?? row.created_at;
          return (
            <li key={row.id} className="rounded bg-white p-3">
              <p className="font-medium">
                {payment
                  ? formatCurrency(payment.total_amount_minor, payment.currency, i18n.language)
                  : '—'}
                {' · '}
                {new Date(when).toLocaleDateString(i18n.language)}
                {payment?.payment_method
                  ? ` · ${t(`finance.documents_not_issued.method_${payment.payment_method}`, { defaultValue: payment.payment_method })}`
                  : ''}
                {row.document_kind === 'refund' ? ` · ${t('finance.documents_not_issued.refund')}` : ''}
              </p>
              <p className="text-gray-700">
                {row.status === 'not_issued'
                  ? t(
                      row.document_kind === 'refund'
                        ? 'finance.documents_not_issued.reason_refund'
                        : 'finance.documents_not_issued.reason_not_issued',
                      { provider },
                    )
                  : t('finance.documents_not_issued.reason_failed')}
              </p>
              {row.status === 'dead' && row.last_error && (
                <details className="text-xs text-gray-600">
                  <summary>{t('finance.documents_not_issued.details')}</summary>
                  <span dir="ltr">{row.last_error}</span>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
