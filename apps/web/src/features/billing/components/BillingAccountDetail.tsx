import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { formatSavedCard } from '@/features/students/lib/studentBillingAccount';
import { useBillingAccount } from '../hooks';
import { BillingAccountEditForm } from './BillingAccountEditForm';

interface BillingAccountDetailProps {
  id: string;
  onClose?: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-gray-700">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
    </div>
  );
}

/** One billing account: the payer, business invoice details, the saved card and status. */
export function BillingAccountDetail({ id, onClose }: BillingAccountDetailProps): React.ReactNode {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const { data: account, isLoading, error } = useBillingAccount(id);

  if (isLoading) return <p className="p-4" role="status">{t('common.loading')}</p>;
  if (error) {
    return (
      <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-red-700">{t('errors.server_error')}</p>
      </div>
    );
  }
  if (!account) return <p className="p-4">{t('errors.not_found')}</p>;
  if (isEditing) return <BillingAccountEditForm account={account} onDone={() => setIsEditing(false)} />;

  return (
    <div className="space-y-6 p-4">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">{account.holderName ?? t('pages.billing.holder_unknown')}</h2>
          <p className="text-gray-600">{t(`pages.billing.status_${account.status}`)}</p>
        </div>
        {onClose && (
          <Button type="button" onClick={onClose} aria-label={t('common.close')} variant="ghost">
            ✕
          </Button>
        )}
      </div>

      <dl className="space-y-4">
        {account.holderEmail && <Row label={t('pages.billing.email_label')}>{account.holderEmail}</Row>}
        {account.holderPhone && (
          <Row label={t('pages.billing.phone_label')}>
            <span dir="ltr">{account.holderPhone}</span>
          </Row>
        )}
        <Row label={t('pages.billing.saved_card_label')}>
          {account.savedCard ? (
            <span dir="ltr" data-testid="billing-saved-card">{formatSavedCard(account.savedCard)}</span>
          ) : (
            t('pages.billing.no_saved_card')
          )}
        </Row>
        {account.business_name && <Row label={t('pages.billing.business_name_label')}>{account.business_name}</Row>}
        {account.business_tax_id && (
          <Row label={t('pages.billing.business_tax_id_label')}>
            <span dir="ltr">{account.business_tax_id}</span>
          </Row>
        )}
      </dl>

      <Button type="button" onClick={() => setIsEditing(true)} variant="primary">
        {t('common.edit')}
      </Button>
    </div>
  );
}
