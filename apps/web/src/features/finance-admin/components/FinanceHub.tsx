import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@shared/format';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import { useFinanceSummary, useOutstandingEngagements } from '../hooks/useFinanceSummary';
import { computeNetProfitMinor } from '../lib/netProfit';
import { resolvePeriodDateRange } from '../lib/periods';
import { FinancePeriodSelector, useFinancePeriodFromUrl } from './FinancePeriodSelector';

export function FinanceHub() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const tenant = useTenant();
  const period = useFinancePeriodFromUrl();

  const activeSeasonQuery = useQuery({
    queryKey: ['active-season-range', tenant?.id],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      const { data, error } = await supabase
        .from('seasons')
        .select('id, start_date, end_date')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const effectivePeriod = useMemo(() => {
    if (period === 'season_active' && !activeSeasonQuery.data) {
      return 'month_current' as const;
    }
    return period;
  }, [period, activeSeasonQuery.data]);

  const dateRange = useMemo(
    () => resolvePeriodDateRange(effectivePeriod, activeSeasonQuery.data),
    [effectivePeriod, activeSeasonQuery.data],
  );

  const { summary, isLoading: summaryLoading, error: summaryError } = useFinanceSummary({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  const {
    engagements,
    hasActiveSeason,
    isLoading: outstandingLoading,
  } = useOutstandingEngagements();

  const netProfit = summary ? computeNetProfitMinor(summary) : 0;
  const currency = tenant?.currency ?? 'ILS';
  const showNoSeasonMessage = period === 'season_active' && !activeSeasonQuery.data;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-primary mb-2">{t('finance.hub.title')}</h2>
        <p className="text-gray-600">{t('finance.hub.description')}</p>
      </section>

      <div className="space-y-3 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>{t('finance.disclaimer.management_pl')}</p>
        <p>{t('finance.disclaimer.input_vat')}</p>
      </div>

      <FinancePeriodSelector />

      {showNoSeasonMessage && (
        <p className="text-sm text-gray-600" role="status">
          {t('finance.hub.no_active_season')}
        </p>
      )}

      {summaryError && (
        <div className="alert-error" role="alert">{summaryError.message}</div>
      )}

      {summaryLoading && (
        <p role="status">{t('common.loading')}</p>
      )}

      {summary && !summaryLoading && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard
            label={t('finance.hub.metric_revenue')}
            value={formatCurrency(summary.net_revenue_minor, currency, i18n.language)}
          />
          <MetricCard
            label={t('finance.hub.metric_expenses')}
            value={formatCurrency(summary.net_expenses_minor, currency, i18n.language)}
          />
          <MetricCard
            label={t('finance.hub.metric_profit')}
            value={formatCurrency(netProfit, currency, i18n.language)}
          />
          <MetricCard label={t('finance.hub.metric_payment_count')} value={String(summary.payment_count)} />
          <MetricCard
            label={t('finance.hub.metric_outstanding')}
            value={String(summary.outstanding_engagements)}
          />
          <MetricCard
            label={t('finance.hub.metric_failed')}
            value={String(summary.failed_payments_7d)}
          />
        </section>
      )}

      <section className="space-y-4">
        <h3 className="text-lg font-semibold">{t('finance.hub.outstanding_title')}</h3>
        {!hasActiveSeason && (
          <p className="text-sm text-gray-600">{t('finance.hub.no_active_season')}</p>
        )}
        {outstandingLoading && <p role="status">{t('common.loading')}</p>}
        {hasActiveSeason && engagements.length === 0 && (
          <p className="text-sm text-gray-600">{t('finance.payments.empty')}</p>
        )}
        {engagements.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-start">{t('finance.payments.col_payer')}</th>
                  <th className="px-3 py-2 text-start">{t('finance.payments.col_class')}</th>
                  <th className="px-3 py-2 text-start">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {engagements.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">{row.person?.name ?? '—'}</td>
                    <td className="px-3 py-2">{row.offering?.name ?? '—'}</td>
                    <td className="px-3 py-2 space-x-2">
                      <Link to={`/enrol/pay/${row.id}`}>{t('finance.hub.link_pay')}</Link>
                      <Link to="/admin/students">{t('finance.hub.link_students')}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card border border-gray-200 p-4 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">{t('finance.hub.card_payments')}</h3>
          <Button variant="primary" onClick={() => navigate('/admin/finance/payments')}>
            {t('common.manage')} →
          </Button>
        </div>
        <div className="card border border-gray-200 p-4 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">{t('finance.hub.card_expenses')}</h3>
          <Button variant="primary" onClick={() => navigate('/admin/finance/expenses')}>
            {t('common.manage')} →
          </Button>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card border border-gray-200 p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
