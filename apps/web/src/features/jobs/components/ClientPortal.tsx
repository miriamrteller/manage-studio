import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ContactPreferencesEditor } from '@/components/shared/ContactPreferencesEditor';
import { SetPasswordDialog } from '@/components/shared/SetPasswordDialog';
import { useTenant } from '@/hooks/useTenant';
import { useContactPreferences } from '@/features/notifications/hooks/useContactPreferences';
import { useClientPortal } from '../hooks/useClientPortal';
import { ClientPortalService, type ClientShoot } from '../services/clientPortalService';
import { JobPaymentService, type JobPaymentRequest } from '../services/jobPaymentService';
import { formatDueDate, formatMinor, localeFor } from '../lib/jobPaymentFormat';
import { JOB_STATUS_BADGE, jobStatusKey } from '../lib/jobStatus';
import { ClientJobGalleryCard } from './ClientJobGalleryCard';

/**
 * ClientPortal — the photographer client's own portal (an adult client: no
 * children, no date of birth, no "enrol"). Rendered by PortalDashboard for
 * photographer tenants only; every other vertical keeps ParentPortal.
 *
 * Sections: My shoots, Contract, Payments, Gallery, My details.
 */
export function ClientPortal() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const currency = tenant?.currency ?? 'ILS';
  const { data, isLoading, error } = useClientPortal();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

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

  const shoots = data?.shoots ?? [];
  const requests = data?.requests ?? [];
  const multipleShoots = shoots.length > 1;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-primary mb-2">{t('pages.client_portal.title')}</h2>
          <p className="text-gray-600">{t('pages.client_portal.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPrefsOpen(true)}>
            {t('pages.portal.notification_preferences')}
          </Button>
          <Button variant="outline" onClick={() => setPasswordOpen(true)}>
            {t('pages.portal.login_password')}
          </Button>
        </div>
      </section>

      <ContactPreferencesEditor open={prefsOpen} onOpenChange={setPrefsOpen} />
      <SetPasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />

      <ShootsSection shoots={shoots} />

      {shoots.length > 0 && <ContractSection shoots={shoots} labelled={multipleShoots} />}

      <PaymentsSection shoots={shoots} requests={requests} currency={currency} labelled={multipleShoots} />

      {shoots.length > 0 && (
        <section aria-labelledby="client-gallery-heading" className="space-y-3">
          <h3 id="client-gallery-heading" className="text-lg font-semibold text-gray-900">
            {t('pages.client_portal.gallery_heading')}
          </h3>
          <ul className="space-y-3">
            {shoots.map((shoot) => (
              <li key={shoot.engagementId} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                {multipleShoots && <ShootCaption shoot={shoot} />}
                <ClientJobGalleryCard engagementId={shoot.engagementId} currency={currency} mode="gallery" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <DetailsSection self={data?.self ?? null} onEditContact={() => setPrefsOpen(true)} />
    </div>
  );
}

function useShootDate() {
  const { t, i18n } = useTranslation();
  return (iso: string | null): string => {
    if (!iso) return t('pages.client_portal.shoot_unscheduled');
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(localeFor(i18n.language), {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Asia/Jerusalem',
    }).format(date);
  };
}

function ShootCaption({ shoot }: { shoot: ClientShoot }) {
  const { t } = useTranslation();
  const formatDate = useShootDate();
  const name = shoot.packageName ?? formatDate(shoot.bookedStartsAt);
  return (
    <p className="mb-2 text-sm font-medium text-gray-700">
      {t('pages.client_portal.for_shoot', { name })}
    </p>
  );
}

function ShootsSection({ shoots }: { shoots: ClientShoot[] }) {
  const { t } = useTranslation();
  const formatDate = useShootDate();

  return (
    <section aria-labelledby="client-shoots-heading">
      <h3 id="client-shoots-heading" className="text-lg font-semibold text-gray-900 mb-4">
        {t('pages.client_portal.shoots_heading')}
      </h3>
      {shoots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">
          {t('pages.client_portal.no_shoots')}
        </div>
      ) : (
        <ul className="space-y-4">
          {shoots.map((shoot) => (
            <li
              key={shoot.engagementId}
              id={`client-shoot-${shoot.engagementId}`}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="font-medium text-gray-500">{t('pages.client_portal.shoot_date')}</dt>
                <dd className="text-gray-900">{formatDate(shoot.bookedStartsAt)}</dd>
                {shoot.location && (
                  <>
                    <dt className="font-medium text-gray-500">{t('pages.client_portal.shoot_location')}</dt>
                    <dd className="text-gray-900">
                      <bdi>{shoot.location}</bdi>
                    </dd>
                  </>
                )}
                {shoot.packageName && (
                  <>
                    <dt className="font-medium text-gray-500">{t('pages.client_portal.shoot_package')}</dt>
                    <dd className="text-gray-900">
                      <bdi>{shoot.packageName}</bdi>
                    </dd>
                  </>
                )}
                <dt className="font-medium text-gray-500">{t('pages.client_portal.shoot_status')}</dt>
                <dd>
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${JOB_STATUS_BADGE[shoot.jobStatus]}`}
                  >
                    {t(jobStatusKey(shoot.jobStatus))}
                  </span>
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function isCancelled(shoot: ClientShoot): boolean {
  return shoot.jobStatus === 'cancelled' || shoot.engagementStatus === 'cancelled';
}

function ContractSection({ shoots, labelled }: { shoots: ClientShoot[]; labelled: boolean }) {
  const { t } = useTranslation();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const signNow = async (engagementId: string) => {
    setOpeningId(engagementId);
    setErrorId(null);
    try {
      const path = await ClientPortalService.contractSignPath(engagementId);
      window.location.assign(path);
    } catch {
      setErrorId(engagementId);
      setOpeningId(null);
    }
  };

  return (
    <section aria-labelledby="client-contract-heading">
      <h3 id="client-contract-heading" className="text-lg font-semibold text-gray-900 mb-4">
        {t('pages.client_portal.contract_heading')}
      </h3>
      <ul className="space-y-3">
        {shoots.map((shoot) => (
          <li
            key={shoot.engagementId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div>
              {labelled && <ShootCaption shoot={shoot} />}
              {shoot.contractSigned ? (
                <Badge variant="success">{t('pages.client_portal.contract_signed')}</Badge>
              ) : isCancelled(shoot) ? (
                <Badge variant="secondary">{t('pages.client_portal.contract_cancelled')}</Badge>
              ) : (
                <Badge variant="secondary">{t('pages.client_portal.contract_unsigned')}</Badge>
              )}
              {errorId === shoot.engagementId && (
                <p className="mt-2 text-sm text-destructive" role="alert">
                  {t('pages.client_portal.contract_open_error')}
                </p>
              )}
            </div>
            {!shoot.contractSigned && !isCancelled(shoot) && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void signNow(shoot.engagementId)}
                disabled={openingId === shoot.engagementId}
              >
                {openingId === shoot.engagementId
                  ? t('pages.client_portal.contract_opening')
                  : t('pages.client_portal.contract_sign_now')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PaymentsSection({
  shoots,
  requests,
  currency,
  labelled,
}: {
  shoots: ClientShoot[];
  requests: JobPaymentRequest[];
  currency: string;
  labelled: boolean;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const visible = requests.filter((r) => r.status !== 'cancelled');
  const shootById = new Map(shoots.map((s) => [s.engagementId, s]));

  return (
    <section aria-labelledby="client-payments-heading">
      <h3 id="client-payments-heading" className="text-lg font-semibold text-gray-900 mb-4">
        {t('pages.client_portal.payments_heading')}
      </h3>
      {visible.length === 0 ? (
        <p className="text-sm text-gray-500">{t('pages.client_portal.no_payments')}</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {visible.map((r) => {
            const open = r.status === 'pending' || r.status === 'sent';
            const shoot = shootById.get(r.engagement_id);
            const receiptUrl = r.payment?.invoice_url ?? null;
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="space-y-0.5">
                  {labelled && shoot && <ShootCaption shoot={shoot} />}
                  <p className="font-medium text-gray-900">
                    <bdi>{r.label}</bdi> ·{' '}
                    <bdi dir="ltr">{formatMinor(r.amount_minor, r.currency || currency, language)}</bdi>
                  </p>
                  {open && r.due_date && (
                    <p className="text-gray-500">
                      {t('pages.jobs.payments.dueOn', { date: formatDueDate(r.due_date, language) })}
                    </p>
                  )}
                  {r.status === 'paid' && r.paid_at && (
                    <p className="text-gray-500">
                      {t('pages.client_portal.payment_paid_on', { date: formatDueDate(r.paid_at, language) })}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {open ? (
                    <>
                      <Badge variant="default">{t('pages.client_portal.payment_due')}</Badge>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => window.location.assign(JobPaymentService.payUrlFor(r.public_token))}
                      >
                        {t('pages.jobs.client_portal.pay')}
                      </Button>
                    </>
                  ) : r.status === 'paid' ? (
                    <>
                      <Badge variant="success">{t('pages.client_portal.payment_paid')}</Badge>
                      {receiptUrl && (
                        <a
                          href={receiptUrl}
                          className="text-primary underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('pages.client_portal.payment_receipt')}
                        </a>
                      )}
                    </>
                  ) : (
                    <Badge variant="destructive">{t('pages.client_portal.payment_refunded')}</Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function DetailsSection({
  self,
  onEditContact,
}: {
  self: { name: string; email: string | null } | null;
  onEditContact: () => void;
}) {
  const { t } = useTranslation();
  const { preferences } = useContactPreferences({ enabled: Boolean(self) });
  const phone = preferences?.whatsapp_number ?? null;

  return (
    <section aria-labelledby="client-details-heading">
      <h3 id="client-details-heading" className="text-lg font-semibold text-gray-900 mb-4">
        {t('pages.client_portal.details_heading')}
      </h3>
      {!self ? (
        <p className="text-sm text-amber-700">{t('pages.client_portal.details_missing')}</p>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="font-medium text-gray-500">{t('pages.client_portal.details_name')}</dt>
            <dd className="text-gray-900">
              <bdi>{self.name}</bdi>
            </dd>
            <dt className="font-medium text-gray-500">{t('pages.client_portal.details_email')}</dt>
            <dd className="text-gray-900">
              <bdi dir="ltr">{self.email ?? '—'}</bdi>
            </dd>
            <dt className="font-medium text-gray-500">{t('pages.client_portal.details_phone')}</dt>
            <dd className="text-gray-900">
              <bdi dir="ltr">{phone ?? '—'}</bdi>
            </dd>
          </dl>
          <Button variant="outline" size="sm" onClick={onEditContact}>
            {t('pages.client_portal.edit_contact')}
          </Button>
        </div>
      )}
    </section>
  );
}
