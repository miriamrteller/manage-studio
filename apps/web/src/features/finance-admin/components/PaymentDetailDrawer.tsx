import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { formatCurrency } from '@shared/format';
import { Button } from '@/components/ui/button';
import type { PaymentLogRow } from '@shared/schemas';
import {
  getCaptureSourceLabelKey,
  getPayerDisplay,
  getPaymentCaptureSource,
} from '../lib/paymentsLogDisplay';
import { paymentDocumentStatus, vatSplitFromDocument } from '../lib/paymentDocuments';
import { getProviderLabelKey, PaymentsLogService } from '../services/paymentsLogService';
import { PaymentDocumentCell } from './PaymentDocumentCell';

interface PaymentDetailDrawerProps {
  row: PaymentLogRow;
  onClose: () => void;
}

export function PaymentDetailDrawer({ row, onClose }: PaymentDetailDrawerProps) {
  const { t, i18n } = useTranslation();
  const payer = getPayerDisplay(row, t('finance.payments.family_payment'));
  const captureSource = getPaymentCaptureSource(row.provider);
  const tenant = useTenant();
  const doc = paymentDocumentStatus(row, tenant);
  // VAT from the document issued, never from business status.
  const split = vatSplitFromDocument(
    row.total_amount_minor,
    doc.issued ? doc.kind : null,
    row.paid_at ?? row.created_at,
  );
  const originalQuery = useQuery({
    queryKey: ['payment-original-document', tenant?.id, row.refunds_payment_id],
    queryFn: async () => {
      const map = await PaymentsLogService.documentNumbersByPaymentIds(tenant!, [row.refunds_payment_id!]);
      return map.get(row.refunds_payment_id!) ?? null;
    },
    enabled: !!tenant?.id && !!row.refunds_payment_id,
  });

  return (
  <>
    <div
      className="fixed inset-0 bg-black bg-opacity-40 z-40"
      onClick={onClose}
      aria-hidden="true"
    />
    <aside
      className="fixed top-0 bottom-0 end-0 w-full max-w-md bg-white shadow-lg z-50 p-6 space-y-4 overflow-y-auto"
      role="dialog"
      aria-labelledby="payment-detail-title"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="payment-detail-title" className="text-xl font-semibold">
          {t('finance.payments.detail_title')}
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label={t('common.close')}>
          ✕
        </Button>
      </div>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="font-medium">{t('finance.payments.col_payer')}</dt>
          <dd>{payer.label ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('finance.payments.col_class')}</dt>
          <dd>{row.offering?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('finance.payments.col_total')}</dt>
          <dd>{formatCurrency(row.total_amount_minor, row.currency, i18n.language)}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('finance.payments.col_status')}</dt>
          <dd>{t(`finance.payment_status.${row.status}`, { defaultValue: row.status })}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('finance.payments.col_charge_type')}</dt>
          <dd>{t(`finance.charge_type.${row.charge_type}`, { defaultValue: row.charge_type })}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('finance.payments.col_capture_source')}</dt>
          <dd>
            {t(getCaptureSourceLabelKey(captureSource))}
            {captureSource === 'online' && (
              <span className="block text-muted-foreground">
                {t(getProviderLabelKey(row.provider), { defaultValue: row.provider })}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t('finance.payments.col_method')}</dt>
          <dd>
            {row.payment_method
              ? t(`finance.payment_method.${row.payment_method}`, { defaultValue: row.payment_method })
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t('finance.payments.col_document')}</dt>
          <dd>
            <PaymentDocumentCell row={row} />
          </dd>
        </div>
        {split.vatMinor !== null && (
          <div>
            <dt className="font-medium">{t('finance.payments.col_vat_split')}</dt>
            <dd>
              {t('finance.payments.vat_split_value', {
                pretax: formatCurrency(split.pretaxMinor ?? 0, row.currency, i18n.language),
                vat: formatCurrency(split.vatMinor, row.currency, i18n.language),
                rate: Math.round((split.vatRate ?? 0) * 100),
              })}
              <span className="block text-muted-foreground">{t('finance.payments.vat_split_note')}</span>
            </dd>
          </div>
        )}
        {row.refunds_payment_id && (
          <div>
            <dt className="font-medium">{t('finance.accountant_export.col.refund_of_document')}</dt>
            <dd>
              {originalQuery.data === undefined
                ? '…'
                : (originalQuery.data ?? t('finance.accountant_export.refund_of_unknown'))}
            </dd>
          </div>
        )}
        <div>
          <dt className="font-medium">{t('finance.payments.col_engagement')}</dt>
          <dd>{row.engagement_id ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('finance.accountant_export.col.payment_id')}</dt>
          <dd>{row.id}</dd>
        </div>
      </dl>
    </aside>
  </>
  );
}
