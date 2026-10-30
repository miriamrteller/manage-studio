import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WhatsAppButton } from '@/components/ui/whatsapp-button';
import { formatDueDate, formatMinor, statusBadgeVariant, statusI18nKey } from '../lib/jobPaymentFormat';
import { JobPaymentService, type JobPaymentRequest } from '../services/jobPaymentService';

interface Props {
  request: JobPaymentRequest;
  language: string;
  clientPhone: string | null;
  studioName: string;
  busy: boolean;
  onSendLink: () => void;
  onMarkPaid: () => void;
  onRefund: () => void;
  onCancel: () => void;
  onReopen: () => void;
}

export function JobPaymentRequestRow({
  request, language, clientPhone, studioName, busy,
  onSendLink, onMarkPaid, onRefund, onCancel, onReopen,
}: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const payUrl = JobPaymentService.payUrlFor(request.public_token);
  const collectable = request.status === 'pending' || request.status === 'sent';
  const amount = formatMinor(request.amount_minor, request.currency, language);
  // Cash / bank money gets a receipt (קבלה) issued standalone; card charges carry the provider's invoice.
  const offline = request.payment?.payment_method === 'cash' || request.payment?.payment_method === 'bank_transfer';
  const documentKey = offline ? 'pages.jobs.payments.receipt' : 'pages.jobs.payments.invoice';
  const documentPendingKey = offline ? 'pages.jobs.payments.receiptPending' : 'pages.jobs.payments.invoicePending';
  const waMessage = t('pages.jobs.payments.whatsappMessage', { studio: studioName, label: request.label, amount, url: payUrl });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the link is still shown below.
    }
  };

  return (
    <li className="flex flex-col gap-2 border-b py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            <bdi>{request.label}</bdi> · <bdi dir="ltr">{amount}</bdi>
          </p>
          <p className="text-sm text-muted-foreground">
            {t('pages.jobs.payments.dueOn', { date: formatDueDate(request.due_date, language) })}
            {request.max_installments > 1 && ` · ${t('pages.jobs.payments.installments', { count: request.max_installments })}`}
            {request.paid_at && ` · ${t('pages.jobs.payments.paidOn', { date: formatDueDate(request.paid_at, language) })}`}
          </p>
        </div>
        <Badge variant={statusBadgeVariant(request.status)}>{t(statusI18nKey(request.status))}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {collectable && (
          <>
            <Button size="sm" variant="primary" disabled={busy} onClick={onSendLink}>
              {request.status === 'sent' ? t('pages.jobs.payments.resendLink') : t('pages.jobs.payments.sendLink')}
            </Button>
            {clientPhone && <WhatsAppButton phoneNumber={clientPhone} message={waMessage} variant="compact" />}
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? t('pages.crm.leads.copied') : t('pages.jobs.payments.copyLink')}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={onMarkPaid}>
              {t('pages.jobs.payments.markPaid')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          </>
        )}
        {request.status === 'cancelled' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onReopen}>
            {t('pages.jobs.payments.reopen')}
          </Button>
        )}
        {request.status === 'paid' && (
          <>
            {request.payment?.invoice_url ? (
              <a className="text-sm underline text-primary" href={request.payment.invoice_url} target="_blank" rel="noreferrer">
                {t(documentKey, { number: request.payment.external_document_number ?? '' })}
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">{t(documentPendingKey)}</span>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={onRefund}>
              {t('pages.jobs.payments.recordRefund')}
            </Button>
          </>
        )}
        {request.status === 'refunded_manual' && request.payment?.invoice_url && (
          <a className="text-sm underline text-primary" href={request.payment.invoice_url} target="_blank" rel="noreferrer">
            {t(documentKey, { number: request.payment.external_document_number ?? '' })}
          </a>
        )}
      </div>
      {collectable && (
        <code className="text-xs break-all text-muted-foreground" dir="ltr">{payUrl}</code>
      )}
      <span aria-live="polite" className="sr-only">{copied ? t('pages.crm.leads.copied') : ''}</span>
    </li>
  );
}
