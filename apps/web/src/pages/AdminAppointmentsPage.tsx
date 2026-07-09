import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { useTenant } from '@/hooks/useTenant';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { Button } from '@/components/ui/button';
import { AppointmentsService, type AppointmentRow } from '@/features/scheduling/appointmentsService';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  pending_payment: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

export default function AdminAppointmentsPage() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const { hasFeature, isLoading: gateLoading } = useFeatureGate();

  const canView = hasFeature(FEATURES.scheduling.clientBooking) || hasFeature(FEATURES.scheduling.adminBooking);

  const { data: rows = [] } = useQuery<AppointmentRow[]>({
    queryKey: ['appointments', tenant?.id],
    queryFn: () => AppointmentsService.list(tenant as never),
    enabled: !!tenant?.id && canView,
  });

  async function cancel(id: string) {
    if (!tenant?.id) return;
    if (!window.confirm(t('scheduling.appointments.cancel') + '?')) return;
    await AppointmentsService.cancel(tenant as never, id);
    await queryClient.invalidateQueries({ queryKey: ['appointments'] });
  }

  if (!gateLoading && !canView) {
    return (
      <div className="max-w-4xl space-y-2 p-2">
        <h1 className="text-3xl font-bold">{t('scheduling.appointments.title')}</h1>
        <p className="text-gray-600">{t('scheduling.booking.not_available')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6 p-2">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{t('scheduling.appointments.title')}</h1>
        <p className="text-gray-600">{t('scheduling.appointments.subtitle')}</p>
      </header>

      {rows.length === 0 ? (
        <p className="text-gray-500">{t('scheduling.appointments.none')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-start text-gray-500">
                <th className="p-2 text-start">{t('scheduling.appointments.when')}</th>
                <th className="p-2 text-start">{t('scheduling.appointments.service')}</th>
                <th className="p-2 text-start">{t('scheduling.appointments.client')}</th>
                <th className="p-2 text-start">{t('scheduling.appointments.status')}</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="p-2">
                    {new Date(r.booked_starts_at).toLocaleString([], { timeZone: 'Asia/Jerusalem' })}
                  </td>
                  <td className="p-2">{r.offering_name ?? '—'}</td>
                  <td className="p-2">
                    <div>{r.client_name ?? '—'}</div>
                    <div className="text-gray-500">{r.client_email}</div>
                  </td>
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {t(`scheduling.appointments.status_${r.status}`, { defaultValue: r.status })}
                    </span>
                  </td>
                  <td className="p-2 text-end">
                    {r.status !== 'cancelled' && (
                      <Button variant="ghost" size="sm" onClick={() => cancel(r.id)}>
                        {t('scheduling.appointments.cancel')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
