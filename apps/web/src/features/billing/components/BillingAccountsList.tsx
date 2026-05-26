import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/shared';
import { FilterMultiSelect, ListSearchInput, SortableHeader, type FilterOption } from '@/components/shared/table';
import { useSortState } from '@/hooks/useSortState';
import { useBillingAccounts } from '../hooks';
import { DEFAULT_BILLING_SORT, type BillingSortField } from '../service';
import { BillingAccountForm } from './BillingAccountForm';
import { BillingAccountDetail } from './BillingAccountDetail';

export function BillingAccountsList(): React.ReactNode {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<FilterOption[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<FilterOption[]>([]);
  const { sortField, sortOrder, toggleSort } = useSortState<BillingSortField>(
    DEFAULT_BILLING_SORT.field,
    DEFAULT_BILLING_SORT.order
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { data: listData, isLoading, error } = useBillingAccounts({
    page,
    searchQuery,
    paymentMethods: selectedPaymentMethods.map((p) => p.value),
    statuses: selectedStatuses.map((s) => s.value),
    sortField,
    sortOrder,
  });
  const accounts = listData?.accounts || [];
  const total = listData?.total || 0;

  const handleSort = (field: BillingSortField) => {
    toggleSort(field, () => setPage(1));
  };

  const paymentOptions = [
    { value: 'card', label: t('pages.billing.payment_method_card') },
    { value: 'bank_transfer', label: t('pages.billing.payment_method_bank_transfer') },
    { value: 'cash', label: t('pages.billing.payment_method_cash') },
    { value: 'check', label: t('pages.billing.payment_method_check') },
  ];

  const statusOptions = [
    { value: 'active', label: t('pages.billing.status_active') },
    { value: 'inactive', label: t('pages.billing.status_inactive') },
    { value: 'archived', label: t('pages.billing.status_archived') },
  ];

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('pages.billing.title')}</h1>
        <p className="text-gray-600">{t('pages.billing.description')}</p>
      </div>

      <div className="flex gap-4 flex-wrap items-end">
        <div className="flex-1 min-w-64">
          <ListSearchInput
            id="billing-search"
            value={searchQuery}
            onChange={(q) => {
              setSearchQuery(q);
              setPage(1);
            }}
            placeholder={t('pages.billing.search_placeholder')}
            isSearching={isLoading}
          />
        </div>

        <FilterMultiSelect
          id="payment-filter"
          label={t('pages.billing.filter_by_payment_method')}
          selected={selectedPaymentMethods}
          onChange={(next) => {
            setSelectedPaymentMethods(next);
            setPage(1);
          }}
          options={paymentOptions}
          className="flex-1 min-w-48"
        />

        <FilterMultiSelect
          id="status-filter"
          label={t('pages.billing.filter_by_status')}
          selected={selectedStatuses}
          onChange={(next) => {
            setSelectedStatuses(next);
            setPage(1);
          }}
          options={statusOptions}
          className="flex-1 min-w-48"
        />

        <Button type="button" onClick={() => setIsCreating(true)} variant="primary">
          {t('pages.billing.create_button')}
        </Button>
      </div>

      {isLoading && <p className="text-center py-4">{t('common.loading')}</p>}

      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-red-700">{t('errors.server_error')}</p>
        </div>
      )}

      {!isLoading && accounts.length === 0 && (
        <EmptyState
          title={t('pages.billing.empty_title')}
          message={t('pages.billing.empty_message')}
          actionLabel={t('pages.billing.create_button')}
          onAction={() => setIsCreating(true)}
        />
      )}

      {accounts.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <SortableHeader
                  label={t('pages.billing.account_holder_name_label')}
                  sortKey="account_holder_name"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                  className="ps-4 py-3 text-start font-medium"
                />
                <th className="ps-4 py-3 text-start font-medium" scope="col">
                  {t('pages.billing.email_label')}
                </th>
                <th className="ps-4 py-3 text-start font-medium" scope="col">
                  {t('pages.billing.payment_method_label')}
                </th>
                <SortableHeader
                  label={t('common.status')}
                  sortKey="status"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                  className="ps-4 py-3 text-start font-medium"
                />
                <th className="ps-4 py-3 text-center font-medium" scope="col">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
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
                    <Button
                      type="button"
                      onClick={() => setSelectedAccountId(account.id)}
                      className="button-secondary"
                      variant="secondary"
                    >
                      {t('common.view')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && total > 20 && (
        <div className="flex justify-between items-center pt-4">
          <Button
            type="button"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            variant="outline"
          >
            {t('common.previous')}
          </Button>
          <span className="text-sm">{t('common.page_n', { page })}</span>
          <Button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page * 20 >= total}
            variant="outline"
          >
            {t('common.next')}
          </Button>
        </div>
      )}

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

      {isCreating && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-semibold">{t('pages.billing.create_title')}</h2>
              <Button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label={t('common.close')}
                variant="ghost"
              >
                ✕
              </Button>
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
