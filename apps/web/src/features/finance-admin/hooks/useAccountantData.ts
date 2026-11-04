import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentLogRow } from '@shared/schemas';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { PaymentsLogService } from '../services/paymentsLogService';
import { fetchAllPages } from '../lib/pagedFetch';
import { ACCOUNTANT_EXPORT_STATUSES } from '../lib/accountantExport';
import { parseVatReportPeriod, type VatReportPeriod } from '../lib/periods';

/** The studio's VAT reporting period (tenants.vat_report_period), prefilled "every 2 months". */
export function useVatReportPeriod() {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const key = ['tenant-vat-report-period', tenant?.id];

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<VatReportPeriod> => {
      const { data } = await supabase
        .from('tenants')
        .select('vat_report_period')
        .eq('id', tenant!.id)
        .maybeSingle();
      return parseVatReportPeriod(data?.vat_report_period);
    },
    enabled: !!tenant?.id,
  });

  const save = useMutation({
    mutationFn: async (value: VatReportPeriod) => {
      const { error } = await supabase.from('tenants').update({ vat_report_period: value }).eq('id', tenant!.id);
      if (error) throw error;
      return value;
    },
    onSuccess: (value) => queryClient.setQueryData(key, value),
  });

  return { vatPeriod: query.data ?? ('bi_monthly' as VatReportPeriod), setVatPeriod: save.mutate };
}

/** Every paid payment and refund between two dates (inclusive), all pages. */
export function usePaidPayments(range: { startDate: string; endDate: string } | null) {
  const tenant = useTenant();
  return useQuery({
    queryKey: ['paid-payments', tenant?.id, range?.startDate, range?.endDate],
    queryFn: (): Promise<PaymentLogRow[]> =>
      fetchAllPages((page, pageSize) =>
        PaymentsLogService.list(tenant!, {
          page,
          pageSize,
          forExport: true,
          filters: {
            statuses: ACCOUNTANT_EXPORT_STATUSES,
            dateFrom: range!.startDate,
            dateTo: range!.endDate,
          },
        }),
      ),
    enabled: !!tenant?.id && !!range,
    staleTime: 60_000,
  });
}
