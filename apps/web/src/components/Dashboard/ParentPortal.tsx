import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useParentPortal, type EngagementWithOffering } from './useParentPortal';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatSchedule(day: number | null, startTime: string | null): string {
  if (day == null && !startTime) return '';
  const dayLabel = day != null ? DAY_NAMES[day] : '';
  const timeLabel = startTime ? startTime.slice(0, 5) : '';
  if (dayLabel && timeLabel) return `${dayLabel} · ${timeLabel}`;
  return dayLabel || timeLabel;
}

function formatMoney(amountMinor: number, currency: string): string {
  return (amountMinor / 100).toLocaleString(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  });
}

function EnrolmentStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const label = t(`pages.portal.enrolment_status.${status}`, status);
  const tone =
    status === 'active'
      ? 'bg-green-100 text-green-800'
      : status === 'pending_payment'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-gray-100 text-gray-700';

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

function EnrolmentRow({ enrolment }: { enrolment: EngagementWithOffering }) {
  const schedule = formatSchedule(enrolment.classDay, enrolment.classStartTime);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-gray-100 last:border-0">
      <div>
        <p className="font-medium text-gray-900">{enrolment.className ?? enrolment.offering_id}</p>
        {schedule && <p className="text-sm text-gray-500">{schedule}</p>}
      </div>
      <EnrolmentStatusBadge status={enrolment.status} />
    </li>
  );
}

export function ParentPortal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, error } = useParentPortal();

  if (isLoading) {
    return (
      <div role="status" aria-live="polite">
        {t('common.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
        {t('errors.dashboard_load_failed')}
      </div>
    );
  }

  const children = data?.children ?? [];
  const payments = data?.payments ?? [];
  const enrolmentsByPerson = data?.enrolmentsByPerson ?? {};

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-primary mb-2">
            {t('pages.portal_dashboard')}
          </h2>
          <p className="text-gray-600">{t('pages.portal.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/enrol')}>
          {t('pages.portal.enrol_new')}
        </Button>
      </section>

      <section aria-labelledby="portal-children-heading">
        <h3 id="portal-children-heading" className="text-lg font-semibold text-gray-900 mb-4">
          {t('pages.portal.children_heading')}
        </h3>

        {children.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">
            <p>{t('pages.portal.no_children')}</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/enrol')}>
              {t('pages.portal.enrol_new')}
            </Button>
          </div>
        ) : (
          <ul className="space-y-4">
            {children.map((child) => {
              const enrolments = enrolmentsByPerson[child.id] ?? [];
              return (
                <li
                  key={child.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3">
                    <p className="font-semibold text-gray-900">{child.name}</p>
                    {child.date_of_birth && (
                      <p className="text-sm text-gray-500">
                        {t('form.person.date_of_birth')}:{' '}
                        {new Date(child.date_of_birth).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  {enrolments.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('pages.portal.no_enrolments')}</p>
                  ) : (
                    <ul className="mt-2" aria-label={t('pages.portal.enrolments_for', { name: child.name })}>
                      {enrolments.map((enrolment) => (
                        <EnrolmentRow key={enrolment.id} enrolment={enrolment} />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="portal-payments-heading">
        <h3 id="portal-payments-heading" className="text-lg font-semibold text-gray-900 mb-4">
          {t('pages.portal.payments_heading')}
        </h3>

        {payments.length === 0 ? (
          <p className="text-sm text-gray-500">{t('pages.portal.no_payments')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-start">
                <tr>
                  <th className="px-4 py-2 font-medium text-gray-700">{t('pages.portal.payment_date')}</th>
                  <th className="px-4 py-2 font-medium text-gray-700">{t('pages.portal.payment_amount')}</th>
                  <th className="px-4 py-2 font-medium text-gray-700">{t('pages.portal.payment_status')}</th>
                  <th className="px-4 py-2 font-medium text-gray-700">{t('pages.portal.payment_invoice')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-700">
                      {payment.paid_at
                        ? new Date(payment.paid_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {formatMoney(payment.total_amount_minor, payment.currency)}
                    </td>
                    <td className="px-4 py-2 capitalize text-gray-700">{payment.status}</td>
                    <td className="px-4 py-2 text-gray-600">{payment.invoice_number ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
