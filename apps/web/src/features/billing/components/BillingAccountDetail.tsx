import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBillingAccount, useDeleteBillingAccount } from '../hooks';
import { BillingAccountForm } from './BillingAccountForm';

interface BillingAccountDetailProps {
  id: string;
  onClose?: () => void;
}

/**
 * BillingAccountDetail: Display billing account details
 * - Shows all account fields
 * - Edit button opens form modal
 * - Delete button with confirmation dialog
 * - WCAG 2.1 AA compliant
 */
export function BillingAccountDetail({
  id,
  onClose,
}: BillingAccountDetailProps): React.ReactNode {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: account, isLoading, error } = useBillingAccount(id);
  const { mutate: deleteAccount, isPending: isDeleting_ } =
    useDeleteBillingAccount({
      onSuccess: () => {
        onClose?.();
      },
    });

  if (isLoading) {
    return (
      <div className="p-4">
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-red-700">{t('errors.server_error')}</p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="p-4">
        <p>{t('errors.not_found')}</p>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-semibold">
            {t('pages.billing.edit_title')}
          </h2>
          <button
            onClick={() => setIsEditing(false)}
            className="text-gray-500 hover:text-gray-700"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
        <BillingAccountForm
          onSuccess={() => {
            setIsEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">
            {account.account_holder_name}
          </h2>
          <p className="text-gray-600">
            {t(`pages.billing.status_${account.status}`)}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        )}
      </div>

      {/* Account Details */}
      <dl className="space-y-4">
        <div>
          <dt className="font-semibold text-gray-700">
            {t('pages.billing.email_label')}
          </dt>
          <dd className="text-gray-900">{account.primary_contact_email}</dd>
        </div>

        {account.primary_contact_phone && (
          <div>
            <dt className="font-semibold text-gray-700">
              {t('pages.billing.phone_label')}
            </dt>
            <dd className="text-gray-900">{account.primary_contact_phone}</dd>
          </div>
        )}

        <div>
          <dt className="font-semibold text-gray-700">
            {t('pages.billing.payment_method_label')}
          </dt>
          <dd className="text-gray-900">
            {t(
              `pages.billing.payment_method_${account.payment_method}`
            )}
          </dd>
        </div>

        <div>
          <dt className="font-semibold text-gray-700">
            {t('common.status')}
          </dt>
          <dd className="text-gray-900">
            {t(`pages.billing.status_${account.status}`)}
          </dd>
        </div>
      </dl>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4">
        <button
          onClick={() => setIsEditing(true)}
          className="button-primary"
        >
          {t('common.edit')}
        </button>
        <button
          onClick={() => setIsDeleting(true)}
          className="button-outline border-red-300 text-red-600 hover:bg-red-50"
        >
          {t('common.delete')}
        </button>
      </div>

      {/* Delete Confirmation Dialog */}
      {isDeleting && (
        <div
          role="alert"
          className="p-4 bg-red-50 border border-red-300 rounded space-y-4"
        >
          <p className="font-semibold text-red-900">
            {t('pages.billing.delete_confirm', {
              name: account.account_holder_name,
            })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => deleteAccount(id)}
              disabled={isDeleting_}
              className="button-error"
            >
              {isDeleting_ ? t('common.loading') : t('common.confirm')}
            </button>
            <button
              onClick={() => setIsDeleting(false)}
              disabled={isDeleting_}
              className="button-outline"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
