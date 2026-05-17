import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBillingAccounts } from '../hooks';
import { BillingAccountForm } from './BillingAccountForm';
import { BillingAccountDetail } from './BillingAccountDetail';

/**
 * BillingAccountsList: Paginated list of billing accounts
 * - Search by account holder name or email
 * - Filter by payment method + status
 * - Create button opens form modal
 * - Row click opens detail modal
 * - Accessibility: Table with scope, form labels, proper focus management
 */
export function BillingAccountsList(): React.ReactNode {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'card' | 'bank_transfer' | 'cash' | 'check'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'archived'>('all');

  const { data: listData, isLoading, error } = useBillingAccounts({ page });
  const accounts = listData?.accounts || [];
  const total = listData?.total || 0;

  const filteredAccounts = accounts.filter(a => {
    if (paymentFilter !== 'all' && a.payment_method !== paymentFilter) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4 p-4">
      {/* Page Title */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('pages.billing.title')}</h1>
        <p className="text-gray-600">{t('pages.billing.description')}</p>
      </div>

      {/* Filter Bar */}
      <div className="flex gap-4 flex-wrap items-end">
        <div className="flex-1 min-w-64">
          <label htmlFor="payment-filter" className="block text-sm font-medium mb-1">
            {t('pages.billing.filter_by_payment_method')}
          </label>
          <select
            id="payment-filter"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as typeof paymentFilter)}
            className="w-full form-input"
          >
            <option value="all">{t('common.all')}</option>
            <option value="card">{t('pages.billing.payment_method_card')}</option>
            <option value="bank_transfer">{t('pages.billing.payment_method_bank_transfer')}</option>
            <option value="cash">{t('pages.billing.payment_method_cash')}</option>
            <option value="check">{t('pages.billing.payment_method_check')}</option>
          </select>
        </div>

        <div className="flex-1 min-w-64">
          <label htmlFor="status-filter" className="block text-sm font-medium mb-1">
            {t('pages.billing.filter_by_status')}
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="w-full form-input"
          >
            <option value="all">{t('common.all')}</option>
            <option value="active">{t('pages.billing.status_active')}</option>
            <option value="inactive">{t('pages.billing.status_inactive')}</option>
            <option value="archived">{t('pages.billing.status_archived')}</option>
          </select>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="button-primary"
        >
          {t('pages.billing.create_button')}
        </button>
      </div>

      {/* Loading State */}
      {isLoading && <p className="text-center py-4">{t('common.loading')}</p>}

      {/* Error State */}
      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-red-700">{t('errors.server_error')}</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredAccounts.length === 0 && (
        <div className="text-center py-4 text-gray-600">
          {t('common.no_results_found')}
        </div>
      )}

      {/* Accounts Table */}
      {filteredAccounts.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="ps-4 py-3 text-start font-medium" scope="col">
                  {t('pages.billing.account_holder_name_label')}
                </th>
                <th className="ps-4 py-3 text-start font-medium" scope="col">
                  {t('pages.billing.email_label')}
                </th>
                <th className="ps-4 py-3 text-start font-medium" scope="col">
                  {t('pages.billing.payment_method_label')}
                </th>
                <th className="ps-4 py-3 text-start font-medium" scope="col">
                  {t('common.status')}
                </th>
                <th className="ps-4 py-3 text-center font-medium" scope="col">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => (
                <tr key={account.id} className="border-b hover:bg-gray-50">
                  <td className="ps-4 py-3">{account.account_holder_name}</td>
                  <td className="ps-4 py-3">{account.primary_contact_email}</td>
                  <td className="ps-4 py-3">
                    {t(`pages.billing.payment_method_${account.payment_method}`)}
                  </td>
                  <td className="ps-4 py-3">
                    {t(`pages.billing.status_${account.status}`)}
                  </td>
                  <td className="ps-4 py-3">
                    <button
                      onClick={() => setSelectedAccountId(account.id)}
                      className="button-secondary"
                    >
                      {t('common.view')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && total > 20 && (
        <div className="flex justify-between items-center pt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="button-outline"
          >
            {t('common.previous')}
          </button>
          <span className="text-sm">
            {t('common.page_n', { page })}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page * 20 >= total}
            className="button-outline"
          >
            {t('common.next')}
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedAccountId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <BillingAccountDetail
              id={selectedAccountId}
              onClose={() => setSelectedAccountId(null)}
            />
          </div>
        </div>
      )}

      {/* Create Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-semibold">
                {t('pages.billing.create_title')}
              </h2>
              <button
                onClick={() => setIsCreating(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>
            <BillingAccountForm
              onSuccess={() => {
                setIsCreating(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
