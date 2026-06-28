import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { PaymentsLogFiltersBar, usePaymentsLogFilterState } from './PaymentsLogFilters';
import { PaymentsLogTable } from './PaymentsLogTable';
import { PaymentDetailDrawer } from './PaymentDetailDrawer';
import { usePaymentsLog } from '../hooks/usePaymentsLog';
import { PaymentsLogService } from '../services/paymentsLogService';
import type { PaymentLogRow } from '@shared/schemas';
import { exportPaymentsCsv } from '../lib/csvExport';
import { datedCsvFilename } from '../lib/financeAdminUtils';

export function PaymentsLog() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const {
    filters,
    setFilters,
    payerSearch,
    setPayerSearch,
    page,
    setPage,
  } = usePaymentsLogFilterState();
  const debouncedPayerSearch = useDebounce(payerSearch, 300);
  const [selectedRow, setSelectedRow] = useState<PaymentLogRow | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const payerIdsQuery = useQuery({
    queryKey: ['payments-payer-search', tenant?.id, debouncedPayerSearch],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return PaymentsLogService.searchPayerPersonIds(tenant, debouncedPayerSearch);
    },
    enabled: !!tenant?.id && debouncedPayerSearch.trim().length > 0,
  });

  const effectiveFilters = useMemo(() => {
    if (!debouncedPayerSearch.trim()) return filters;
    const ids = payerIdsQuery.data ?? [];
    if (ids.length === 0) {
      return { ...filters, personIds: ['00000000-0000-0000-0000-000000000000'] };
    }
    return { ...filters, personIds: ids };
  }, [filters, debouncedPayerSearch, payerIdsQuery.data]);

  const { rows, totalCount, pageSize, isLoading, error } = usePaymentsLog({
    page,
    filters: effectiveFilters,
    enabled: !debouncedPayerSearch.trim() || payerIdsQuery.isFetched,
  });

  const handleExport = async () => {
    if (!tenant) return;
    setExportError(null);
    try {
      const { totalCount: exportTotal } = await PaymentsLogService.list(tenant, {
        page: 1,
        pageSize: 1,
        filters: effectiveFilters,
      });
      if (exportTotal > 5000) {
        setExportError(t('finance.export.too_many'));
        return;
      }
      const { rows: exportRows } = await PaymentsLogService.list(tenant, {
        page: 1,
        pageSize: 5000,
        filters: effectiveFilters,
      });
      exportPaymentsCsv(exportRows, datedCsvFilename('payments', tenant.subdomain), t);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('finance.payments.title')}</h1>
      </div>

      <PaymentsLogFiltersBar
        filters={filters}
        onChange={setFilters}
        payerSearch={payerSearch}
        onPayerSearchChange={setPayerSearch}
      />

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleExport}>
          {t('finance.payments.export')}
        </Button>
      </div>

      {exportError && (
        <div className="alert-error" role="alert">{exportError}</div>
      )}

      {isLoading && (
        <p role="status">{t('finance.payments.loading')}</p>
      )}

      {error && (
        <div className="alert-error" role="alert">{error.message}</div>
      )}

      {!isLoading && rows.length === 0 && (
        <EmptyState title={t('finance.payments.empty')} message="" />
      )}

      {rows.length > 0 && (
        <>
          <PaymentsLogTable rows={rows} onRowClick={setSelectedRow} />
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-600">
              {t('common.page')} {page}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {t('common.previous')}
              </Button>
              <Button
                variant="outline"
                disabled={page * pageSize >= totalCount}
                onClick={() => setPage(page + 1)}
              >
                {t('common.next')}
              </Button>
            </div>
          </div>
        </>
      )}

      {selectedRow && (
        <PaymentDetailDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  );
}
