import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FilterMultiSelect, type FilterOption } from '@/components/shared/table';
import {
  filterEnrolmentsByStatus,
  getEnrolmentStatusFilterOptions,
} from '@/features/enrolment/lib/enrolmentFilterOptions';
import { useParentPortal, type EngagementWithOffering } from './useParentPortal';
import { EditChildModal } from './EditChildModal';
import { AddChildModal } from './AddChildModal';
import { EnrolmentStatusAction } from '@/features/enrolment/components/EnrolmentStatusAction';
import { readPortalHighlightState } from '@/lib/portalHighlight';

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

function EnrolmentRow({
  enrolment,
  highlighted,
}: {
  enrolment: EngagementWithOffering;
  highlighted?: boolean;
}) {
  const schedule = formatSchedule(enrolment.classDay, enrolment.classStartTime);

  return (
    <li
      id={highlighted ? `portal-enrolment-${enrolment.id}` : undefined}
      className={[
        'flex flex-wrap items-center justify-between gap-2 py-2 border-b border-gray-100 last:border-0',
        highlighted ? 'rounded-md bg-green-50 ring-2 ring-green-400 px-2 -mx-2' : '',
      ].join(' ')}
    >
      <div>
        <p className="font-medium text-gray-900">{enrolment.className ?? enrolment.offering_id}</p>
        {schedule && <p className="text-sm text-gray-500">{schedule}</p>}
      </div>
      <EnrolmentStatusAction
        status={enrolment.status}
        engagementId={enrolment.id}
        returnTo="/dashboard/portal"
      />
    </li>
  );
}

export function ParentPortal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [portalHighlight] = useState(() => readPortalHighlightState(location.state));
  const { data, isLoading, error } = useParentPortal();
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [showAddChild, setShowAddChild] = useState(false);
  const [selectedEnrolmentStatuses, setSelectedEnrolmentStatuses] = useState<FilterOption[]>([]);
  const [showSuccessBanner, setShowSuccessBanner] = useState(Boolean(portalHighlight?.enrolmentSuccess));
  const scrolledRef = useRef(false);

  const children = data?.children;
  const payments = data?.payments ?? [];
  const enrolmentsByPerson = data?.enrolmentsByPerson;

  const enrolmentStatusOptions = useMemo(() => getEnrolmentStatusFilterOptions(t), [t]);
  const enrolmentStatusFilterValues = selectedEnrolmentStatuses.map((s) => s.value);

  const filteredChildren = useMemo(() => {
    const childList = children ?? [];
    if (enrolmentStatusFilterValues.length === 0) return childList;
    return childList.filter((child) => {
      const enrolments = enrolmentsByPerson?.[child.id] ?? [];
      return filterEnrolmentsByStatus(enrolments, enrolmentStatusFilterValues).length > 0;
    });
  }, [children, enrolmentsByPerson, enrolmentStatusFilterValues]);

  const getVisibleEnrolments = (personId: string): EngagementWithOffering[] => {
    const enrolments = enrolmentsByPerson?.[personId] ?? [];
    return filterEnrolmentsByStatus(enrolments, enrolmentStatusFilterValues);
  };

  const highlightPersonId = useMemo(() => {
    if (portalHighlight?.highlightPersonId) return portalHighlight.highlightPersonId;
    if (!portalHighlight?.highlightEngagementId || !enrolmentsByPerson) return undefined;
    for (const [personId, enrolments] of Object.entries(enrolmentsByPerson)) {
      if (enrolments.some((entry) => entry.id === portalHighlight.highlightEngagementId)) {
        return personId;
      }
    }
    return undefined;
  }, [enrolmentsByPerson, portalHighlight?.highlightEngagementId, portalHighlight?.highlightPersonId]);

  useEffect(() => {
    if (!portalHighlight || isLoading || scrolledRef.current) return;

    const frame = requestAnimationFrame(() => {
      const targetId = portalHighlight.highlightEngagementId
        ? `portal-enrolment-${portalHighlight.highlightEngagementId}`
        : highlightPersonId
          ? `portal-child-${highlightPersonId}`
          : null;

      if (targetId) {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      scrolledRef.current = true;
      if (location.state) {
        navigate(location.pathname, { replace: true, state: null });
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [highlightPersonId, isLoading, location.pathname, location.state, navigate, portalHighlight]);

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

  const editingChild = (children ?? []).find((child) => child.id === editingChildId) ?? null;

  return (
    <div className="space-y-8">
      {showSuccessBanner && (
        <div
          className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
          role="status"
        >
          <p className="font-medium">{t('pages.portal.enrolment_success_title')}</p>
          <p className="mt-1">{t('pages.portal.enrolment_success_desc')}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 h-auto px-0 text-green-800 underline"
            onClick={() => setShowSuccessBanner(false)}
          >
            {t('common.close')}
          </Button>
        </div>
      )}

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
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h3 id="portal-children-heading" className="text-lg font-semibold text-gray-900">
            {t('pages.portal.children_heading')}
          </h3>
          <div className="flex flex-wrap items-end gap-2">
            <FilterMultiSelect
              id="portal-enrolment-status-filter"
              label={t('pages.portal.filter_by_enrolment_status')}
              options={enrolmentStatusOptions}
              selected={selectedEnrolmentStatuses}
              onChange={setSelectedEnrolmentStatuses}
              className="min-w-48"
            />
            <Button variant="outline" size="sm" onClick={() => setShowAddChild(true)}>
              {t('pages.portal.add_child')}
            </Button>
          </div>
        </div>

        {(children ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">
            <p>{t('pages.portal.no_children')}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => setShowAddChild(true)}>
                {t('pages.portal.add_child')}
              </Button>
              <Button variant="primary" onClick={() => navigate('/enrol')}>
                {t('pages.portal.enrol_new')}
              </Button>
            </div>
          </div>
        ) : filteredChildren.length === 0 ? (
          <p className="text-sm text-gray-500">{t('pages.portal.no_enrolments_for_filter')}</p>
        ) : (
          <ul className="space-y-4">
            {filteredChildren.map((child) => {
              const enrolments = getVisibleEnrolments(child.id);
              const childHighlighted = child.id === highlightPersonId;
              return (
                <li
                  key={child.id}
                  id={`portal-child-${child.id}`}
                  className={[
                    'rounded-lg border bg-white p-4 shadow-sm',
                    childHighlighted ? 'border-green-400 ring-2 ring-green-200' : 'border-gray-200',
                  ].join(' ')}
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">{child.name}</p>
                      {child.date_of_birth && (
                        <p className="text-sm text-gray-500">
                          {t('form.person.date_of_birth')}:{' '}
                          {new Date(child.date_of_birth).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingChildId(child.id)}
                      >
                        {t('pages.portal.edit_child')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          navigate('/enrol', { state: { personId: child.id, from: '/dashboard/portal' } })
                        }
                      >
                        {t('pages.classes.enrol')}
                      </Button>
                    </div>
                  </div>

                  {enrolments.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('pages.portal.no_enrolments')}</p>
                  ) : (
                    <ul className="mt-2" aria-label={t('pages.portal.enrolments_for', { name: child.name })}>
                      {enrolments.map((enrolment) => (
                        <EnrolmentRow
                          key={enrolment.id}
                          enrolment={enrolment}
                          highlighted={enrolment.id === portalHighlight?.highlightEngagementId}
                        />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editingChild && (
        <EditChildModal child={editingChild} onClose={() => setEditingChildId(null)} />
      )}

      {showAddChild && <AddChildModal onClose={() => setShowAddChild(false)} />}

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
                    <td className="px-4 py-2 text-gray-600">
                      {payment.external_document_number ? (
                        payment.invoice_url ? (
                          <a
                            href={payment.invoice_url}
                            className="text-primary underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {payment.external_document_number}
                          </a>
                        ) : (
                          payment.external_document_number
                        )
                      ) : (
                        '—'
                      )}
                    </td>
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
