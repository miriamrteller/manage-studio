import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '@shared/format';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { usePaidPayments } from '../hooks/useAccountantData';
import { lastMonths, revenueByMethod, revenueByMonth } from '../lib/financeCharts';

/** One series, one hue (reference palette slot 1, validated on the light surface). */
const SERIES_COLOR = '#2a78d6';
const GRID_COLOR = '#e5e7eb';
const AXIS_TEXT = '#52514e';

function monthLabel(month: string, language: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(language, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/**
 * Finance hub charts: money received by month (last 12 months, refunds subtracted), by
 * payment method, and paid vs still waiting. Every chart has a hover tooltip and a table view.
 */
export function FinanceCharts() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const currency = tenant?.currency ?? 'ILS';
  const ids = useId();

  const months = useMemo(() => lastMonths(12), []);
  const range = useMemo(() => {
    const [y, m] = months[months.length - 1].split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { startDate: `${months[0]}-01`, endDate: `${months[months.length - 1]}-${String(lastDay).padStart(2, '0')}` };
  }, [months]);
  const { data: rows, isLoading, error } = usePaidPayments(range);

  const openRequests = useQuery({
    queryKey: ['open-payment-requests', tenant?.id],
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from('job_payment_requests')
        .select('amount_minor')
        .eq('tenant_id', tenant!.id)
        .in('status', ['pending', 'sent']);
      if (e) throw e;
      const list = data ?? [];
      return { count: list.length, totalMinor: list.reduce((sum, r) => sum + Number(r.amount_minor ?? 0), 0) };
    },
    enabled: !!tenant?.id,
  });

  const byMonth = useMemo(() => (rows ? revenueByMonth(rows, months) : []), [rows, months]);
  const byMethod = useMemo(() => (rows ? revenueByMethod(rows) : []), [rows]);
  const receivedMinor = byMonth.reduce((sum, m) => sum + m.netMinor, 0);

  const money = (minor: number) => formatCurrency(minor, currency, i18n.language);
  const methodLabel = (method: string) => t(`finance.payment_method.${method}`, { defaultValue: method });

  if (error) return <div className="alert-error" role="alert">{t('finance.charts.load_failed')}</div>;
  if (isLoading || !rows) return <p role="status">{t('common.loading')}</p>;

  const monthData = byMonth.map((m) => ({ ...m, label: monthLabel(m.month, i18n.language), value: m.netMinor / 100 }));
  const methodData = byMethod.map((m) => ({ ...m, label: methodLabel(m.method), value: m.totalMinor / 100 }));

  return (
    <section className="space-y-6" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`} className="text-lg font-semibold">
        {t('finance.charts.title')}
      </h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card border border-gray-200 p-4">
          <p className="text-sm text-gray-600">{t('finance.charts.received_12m')}</p>
          <p className="text-2xl font-semibold text-gray-900">{money(receivedMinor)}</p>
        </div>
        <div className="card border border-gray-200 p-4">
          <p className="text-sm text-gray-600">{t('finance.charts.waiting')}</p>
          <p className="text-2xl font-semibold text-gray-900">{money(openRequests.data?.totalMinor ?? 0)}</p>
          <p className="text-sm text-gray-600">
            {t('finance.charts.waiting_count', { count: openRequests.data?.count ?? 0 })}
          </p>
        </div>
      </div>

      <figure className="card border border-gray-200 p-4 space-y-2">
        <figcaption className="font-medium">{t('finance.charts.by_month')}</figcaption>
        <div dir="ltr" style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={monthData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid vertical={false} stroke={GRID_COLOR} />
              <XAxis dataKey="label" tick={{ fill: AXIS_TEXT, fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(v: number) => formatCurrency(Math.round(v) * 100, currency, i18n.language)}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                formatter={(v: number) => [money(Math.round(v * 100)), t('finance.charts.net_received')]}
              />
              <Bar dataKey="value" fill={SERIES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer">{t('finance.charts.show_table')}</summary>
          <table className="mt-2 w-full">
            <thead>
              <tr>
                <th className="px-2 py-1 text-start">{t('finance.charts.col_month')}</th>
                <th className="px-2 py-1 text-start">{t('finance.charts.col_paid')}</th>
                <th className="px-2 py-1 text-start">{t('finance.charts.col_refunds')}</th>
                <th className="px-2 py-1 text-start">{t('finance.charts.net_received')}</th>
              </tr>
            </thead>
            <tbody>
              {monthData.map((m) => (
                <tr key={m.month}>
                  <td className="px-2 py-1">{m.label}</td>
                  <td className="px-2 py-1">{money(m.paidMinor)}</td>
                  <td className="px-2 py-1">{money(m.refundsMinor)}</td>
                  <td className="px-2 py-1">{money(m.netMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figure>

      <figure className="card border border-gray-200 p-4 space-y-2">
        <figcaption className="font-medium">{t('finance.charts.by_method')}</figcaption>
        {methodData.length === 0 ? (
          <p className="text-sm text-gray-600">{t('finance.charts.empty')}</p>
        ) : (
          <>
            <div dir="ltr" style={{ width: '100%', height: Math.max(120, methodData.length * 40) }}>
              <ResponsiveContainer>
                <BarChart data={methodData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={110}
                    tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    formatter={(v: number) => [money(Math.round(v * 100)), t('finance.charts.net_received')]}
                  />
                  <Bar dataKey="value" fill={SERIES_COLOR} radius={[0, 4, 4, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer">{t('finance.charts.show_table')}</summary>
              <table className="mt-2 w-full">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-start">{t('finance.payments.col_method')}</th>
                    <th className="px-2 py-1 text-start">{t('finance.charts.net_received')}</th>
                    <th className="px-2 py-1 text-start">{t('finance.charts.col_count')}</th>
                  </tr>
                </thead>
                <tbody>
                  {methodData.map((m) => (
                    <tr key={m.method}>
                      <td className="px-2 py-1">{m.label}</td>
                      <td className="px-2 py-1">{money(m.totalMinor)}</td>
                      <td className="px-2 py-1">{m.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </figure>
    </section>
  );
}
