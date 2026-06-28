import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterMultiSelect, type FilterOption } from '@/components/shared/table';
import type { PaymentsLogFilters } from '../services/paymentsLogService';

const STATUS_OPTIONS: FilterOption[] = [
  { value: 'succeeded', label: 'succeeded' },
  { value: 'partially_refunded', label: 'partially_refunded' },
  { value: 'refunded', label: 'refunded' },
  { value: 'pending', label: 'pending' },
  { value: 'failed', label: 'failed' },
  { value: 'disputed', label: 'disputed' },
];

const CHARGE_TYPE_OPTIONS: FilterOption[] = [
  { value: 'initial', label: 'initial' },
  { value: 'renewal', label: 'renewal' },
  { value: 'setup', label: 'setup' },
  { value: 'adjustment', label: 'adjustment' },
  { value: 'refund', label: 'refund' },
];

const CAPTURE_SOURCE_OPTIONS: FilterOption[] = [
  { value: 'manual', label: 'manual' },
  { value: 'online', label: 'online' },
];

interface PaymentsLogFiltersProps {
  filters: PaymentsLogFilters;
  onChange: (filters: PaymentsLogFilters) => void;
  payerSearch: string;
  onPayerSearchChange: (value: string) => void;
}

export function PaymentsLogFiltersBar({
  filters,
  onChange,
  payerSearch,
  onPayerSearchChange,
}: PaymentsLogFiltersProps) {
  const { t } = useTranslation();

  const statusSelected = useMemo(
    () =>
      (filters.statuses ?? []).map((value) => ({
        value,
        label: t(`finance.payment_status.${value}`, { defaultValue: value }),
      })),
    [filters.statuses, t],
  );

  const chargeSelected = useMemo(
    () =>
      (filters.chargeTypes ?? []).map((value) => ({
        value,
        label: t(`finance.charge_type.${value}`, { defaultValue: value }),
      })),
    [filters.chargeTypes, t],
  );

  const captureSourceSelected = useMemo(
    () =>
      (filters.captureSources ?? []).map((value) => ({
        value,
        label: t(`finance.capture_source.${value}`, { defaultValue: value }),
      })),
    [filters.captureSources, t],
  );

  const statusOptions = STATUS_OPTIONS.map((opt) => ({
    value: opt.value,
    label: t(`finance.payment_status.${opt.value}`, { defaultValue: opt.value }),
  }));

  const chargeOptions = CHARGE_TYPE_OPTIONS.map((opt) => ({
    value: opt.value,
    label: t(`finance.charge_type.${opt.value}`, { defaultValue: opt.value }),
  }));

  const captureSourceOptions = CAPTURE_SOURCE_OPTIONS.map((opt) => ({
    value: opt.value,
    label: t(`finance.capture_source.${opt.value}`, { defaultValue: opt.value }),
  }));

  const hasDateFilter = Boolean(filters.dateFrom || filters.dateTo);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <FilterMultiSelect
          id="payments-status-filter"
          label={t('finance.payments.filter_status')}
          options={statusOptions}
          selected={statusSelected}
          onChange={(selected) =>
            onChange({ ...filters, statuses: selected.map((s) => s.value) })
          }
        />
        <FilterMultiSelect
          id="payments-charge-filter"
          label={t('finance.payments.filter_charge_type')}
          options={chargeOptions}
          selected={chargeSelected}
          onChange={(selected) =>
            onChange({ ...filters, chargeTypes: selected.map((s) => s.value) })
          }
        />
        <FilterMultiSelect
          id="payments-capture-source-filter"
          label={t('finance.payments.filter_capture_source')}
          options={captureSourceOptions}
          selected={captureSourceSelected}
          onChange={(selected) =>
            onChange({
              ...filters,
              captureSources: selected.map((s) => s.value as 'manual' | 'online'),
            })
          }
        />
        <label className="block text-sm">
          <span className="block font-medium mb-1">{t('finance.payments.filter_date_from')}</span>
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={filters.dateFrom ?? ''}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || null })}
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium mb-1">{t('finance.payments.filter_date_to')}</span>
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={filters.dateTo ?? ''}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value || null })}
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium mb-1">{t('finance.payments.filter_payer_search')}</span>
          <input
            type="search"
            className="w-full border rounded px-3 py-2"
            value={payerSearch}
            onChange={(e) => onPayerSearchChange(e.target.value)}
          />
        </label>
      </div>
      {hasDateFilter && (
        <p className="text-sm text-gray-600" role="status">
          {t('finance.payments.date_filter_paid_only')}
        </p>
      )}
    </div>
  );
}

export function usePaymentsLogFilterState() {
  const [filters, setFilters] = useState<PaymentsLogFilters>({});
  const [payerSearch, setPayerSearch] = useState('');
  const [page, setPage] = useState(1);

  const resetPage = () => setPage(1);

  return {
    filters,
    setFilters: (next: PaymentsLogFilters) => {
      setFilters(next);
      resetPage();
    },
    payerSearch,
    setPayerSearch: (value: string) => {
      setPayerSearch(value);
      resetPage();
    },
    page,
    setPage,
  };
}
