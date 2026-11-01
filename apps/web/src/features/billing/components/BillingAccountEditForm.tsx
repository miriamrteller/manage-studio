import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useUpdateBillingAccount } from '../hooks';
import type { BillingAccountView } from '../lib/billingAccountView';

const STATUSES = ['active', 'inactive', 'archived'] as const;
type Status = (typeof STATUSES)[number];

/**
 * Edit what belongs to the billing account itself: the optional business buyer details
 * (for business invoices) and the status. The payer's name, email and phone are edited on
 * the person in People.
 */
export function BillingAccountEditForm({
  account,
  onDone,
}: {
  account: BillingAccountView;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [businessName, setBusinessName] = useState(account.business_name ?? '');
  const [businessTaxId, setBusinessTaxId] = useState(account.business_tax_id ?? '');
  const [status, setStatus] = useState<Status>(account.status);
  const save = useUpdateBillingAccount(account.id, { onSuccess: onDone });

  return (
    <form
      className="space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ business_name: businessName, business_tax_id: businessTaxId, status });
      }}
    >
      <h2 className="text-xl font-semibold">{t('pages.billing.edit_title')}</h2>
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="billing-business-name">
          {t('pages.billing.business_name_label')}
        </label>
        <input
          id="billing-business-name"
          className="form-input w-full"
          maxLength={200}
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          aria-describedby="billing-business-hint"
        />
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="billing-business-tax-id">
          {t('pages.billing.business_tax_id_label')}
        </label>
        <input
          id="billing-business-tax-id"
          className="form-input w-full"
          dir="ltr"
          inputMode="numeric"
          maxLength={32}
          value={businessTaxId}
          onChange={(e) => setBusinessTaxId(e.target.value)}
          aria-describedby="billing-business-hint"
        />
        <p id="billing-business-hint" className="text-xs text-muted-foreground">
          {t('pages.billing.business_hint')}
        </p>
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="billing-status">
          {t('common.status')}
        </label>
        <select
          id="billing-status"
          className="form-input w-full"
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`pages.billing.status_${s}`)}
            </option>
          ))}
        </select>
      </div>
      {save.error && (
        <p role="alert" className="text-sm text-destructive">
          {t('errors.server_error')}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" isLoading={save.isPending} disabled={save.isPending}>
          {t('common.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
