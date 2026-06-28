import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@shared/format';
import type { PaymentLogRow } from '@shared/schemas';
import {
  getCaptureSourceLabelKey,
  getPayerDisplay,
  getPaymentCaptureSource,
} from '../lib/paymentsLogDisplay';

interface PaymentsLogTableProps {
  rows: PaymentLogRow[];
  onRowClick?: (row: PaymentLogRow) => void;
}

export function PaymentsLogTable({ rows, onRowClick }: PaymentsLogTableProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm" aria-label={t('finance.payments.table_label')}>
        <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
          <tr>
            <th className="px-3 py-2 text-start font-medium">{t('finance.payments.col_date')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('finance.payments.col_payer')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('finance.payments.col_class')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('finance.payments.col_total')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('finance.payments.col_status')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('finance.payments.col_charge_type')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('finance.payments.col_capture_source')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('finance.payments.col_method')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('finance.payments.col_document')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('finance.payments.col_engagement')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const payer = getPayerDisplay(row, t('finance.payments.family_payment'));
            const dateLabel = row.paid_at?.slice(0, 10) ?? row.created_at.slice(0, 10);
            const hasDocument = row.external_document_number && row.invoice_url;

            return (
              <tr
                key={row.id}
                className={onRowClick ? 'cursor-pointer hover:bg-gray-50' : undefined}
                onClick={() => onRowClick?.(row)}
              >
                <td className="px-3 py-2">{dateLabel}</td>
                <td className="px-3 py-2">{payer.label ?? '—'}</td>
                <td className="px-3 py-2">{row.offering?.name ?? '—'}</td>
                <td className="px-3 py-2">
                  {formatCurrency(row.total_amount_minor, row.currency, i18n.language)}
                </td>
                <td className="px-3 py-2">
                  {t(`finance.payment_status.${row.status}`, { defaultValue: row.status })}
                </td>
                <td className="px-3 py-2">
                  {t(`finance.charge_type.${row.charge_type}`, { defaultValue: row.charge_type })}
                </td>
                <td className="px-3 py-2">
                  {t(getCaptureSourceLabelKey(getPaymentCaptureSource(row.provider)))}
                </td>
                <td className="px-3 py-2">
                  {row.payment_method
                    ? t(`finance.payment_method.${row.payment_method}`, { defaultValue: row.payment_method })
                    : '—'}
                </td>
                <td className="px-3 py-2">
                  {hasDocument ? (
                    <a
                      href={row.invoice_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.external_document_number}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2">{row.engagement?.status ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
