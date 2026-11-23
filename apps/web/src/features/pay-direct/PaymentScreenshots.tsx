import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@shared/format';
import { formatDueDate } from '@/features/jobs/lib/jobPaymentFormat';
import { payByText } from '@/features/jobs/lib/payDirectLabel';
import { PayDirectService } from './payDirectService';

/**
 * Finance › Payments: what clients told the studio on a payment page (owner, 23 Nov 2026):
 * the way they picked (Bit, bank transfer, cash, cheque) and, for Bit / bank transfer, the
 * screenshot of the payment. Information only: the studio records the payment as usual.
 * The studio's email about a new screenshot links here. Hidden when there is none.
 */
export function PaymentScreenshots() {
  const { t, i18n } = useTranslation();
  const id = useId();
  const list = useQuery({ queryKey: ['client-payment-proofs'], queryFn: () => PayDirectService.listProofs(30) });
  const rows = list.data ?? [];
  if (rows.length === 0) return null;
  const locale = i18n.language === 'he' ? 'he-IL' : 'en-GB';

  return (
    <section className="space-y-3 rounded-lg border border-border p-4" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-lg font-semibold">{t('pay_direct.studio.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('pay_direct.studio.description')}</p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">
                {r.client_name ?? '—'}
                {r.amount_minor ? ` · ${formatCurrency(r.amount_minor, r.currency ?? 'ILS', locale)}` : ''}
              </p>
              <p className="text-muted-foreground">
                {[
                  r.what,
                  r.pay_method ? payByText(t, r.pay_method) : null,
                  formatDueDate(r.proof_sent_at ?? r.updated_at, i18n.language),
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            {r.image_url ? (
              <a href={r.image_url} target="_blank" rel="noreferrer" className="font-medium underline">
                {t('pay_direct.studio.open_screenshot')}
              </a>
            ) : (
              <span className="text-muted-foreground">{t('pay_direct.studio.no_screenshot')}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
