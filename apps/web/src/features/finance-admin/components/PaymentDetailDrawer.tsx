import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@shared/format';
import { Button } from '@/components/ui/button';
import type { PaymentLogRow } from '@shared/schemas';
import {
  getCaptureSourceLabelKey,
  getPayerDisplay,
  getPaymentCaptureSource,
} from '../lib/paymentsLogDisplay';
import { getProviderLabelKey } from '../services/paymentsLogService';

interface PaymentDetailDrawerProps {
  row: PaymentLogRow;
  onClose: () => void;
}

export function PaymentDetailDrawer({ row, onClose }: PaymentDetailDrawerProps) {
  const { t, i18n } = useTranslation();
  const payer = getPayerDisplay(row, t('finance.payments.family_payment'));
  const captureSource = getPaymentCaptureSource(row.provider);

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
          <dt className="font-medium">{t('finance.payments.col_pretax')}</dt>
          <dd>{formatCurrency(row.pretax_amount_minor, row.currency, i18n.language)}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('finance.payments.col_vat')}</dt>
          <dd>{formatCurrency(row.vat_amount_minor, row.currency, i18n.language)}</dd>
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
            {row.external_document_number && row.invoice_url ? (
              <a href={row.invoice_url} target="_blank" rel="noopener noreferrer">
                {row.external_document_number}
              </a>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t('finance.payments.col_engagement')}</dt>
          <dd>{row.engagement_id ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-medium">Payment ID</dt>
          <dd>{row.id}</dd>
        </div>
      </dl>
    </aside>
  </>
  );
}
