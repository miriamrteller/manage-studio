import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useTenant } from '@/hooks/useTenant';
import { formatCurrency } from '@shared/format';
import { formatAppointmentWhen } from '@/features/scheduling/lib/formatAppointmentWhen';
import { useJob } from '../hooks/useJobs';
import { JobStatusBadge } from './JobsList';
import { JobDetailsForm } from './JobDetailsForm';
import { JobContractCard } from './JobContractCard';
import { JobBookingProgress } from './JobBookingProgress';
import { JobPaymentsPanel } from './JobPaymentsPanel';
import { JobPhotoShopCard } from './JobPhotoShopCard';
import { PhotoShopPreview } from './ClientPhotoShop';
import { usePhotoShopEnabled } from '../hooks/usePhotoShop';
import { CancelShootButton } from './CancelShootButton';
import { CreateQuoteButton } from '@/features/quotes/components/CreateQuoteButton';

/**
 * Admin job ("Shoot") detail: client, package, date/time, location, status,
 * notes, contract status, and the payments slot owned by the payment-requests
 * work (<JobPaymentsPanel engagementId />).
 *
 * With the photo shop on, tabs at the top (owner, 13 Nov 2026: no scrolling to find it):
 * Details | Photo shop | What your client sees. The tab is kept in the address (?tab=).
 */
const SHOOT_TABS = ['details', 'shop', 'client'] as const;
type ShootTab = (typeof SHOOT_TABS)[number];

export function JobDetail({ engagementId }: { engagementId: string }) {
  const { t, i18n } = useTranslation();
  const { labels } = useEntityLabels();
  const tenant = useTenant();
  const { job, isLoading, error } = useJob(engagementId);
  const shopOn = usePhotoShopEnabled();
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const tab: ShootTab = (SHOOT_TABS as readonly string[]).includes(asked ?? '') ? (asked as ShootTab) : 'details';

  if (isLoading) return <p role="status">{t('common.loading')}</p>;
  if (error) {
    return (
      <div className="alert-error" role="alert">
        {error.message}
      </div>
    );
  }
  if (!job) return <p>{t('pages.jobs.not_found')}</p>;

  const locale = tenant?.locale ?? 'he-IL';
  const price =
    job.price_minor !== null ? formatCurrency(job.price_minor, job.currency ?? 'ILS', locale) : '—';

  // An element, not a component: a component made here would remount its forms on each render.
  const details = (
    <>
      <section className="card p-4 space-y-2" aria-labelledby="job-client-heading">
        <h2 id="job-client-heading" className="font-semibold">
          {labels.account.singular}
        </h2>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm">
          <dt className="text-muted-foreground">{t('pages.jobs.client_name')}</dt>
          <dd>{job.client_name ?? '—'}</dd>
          <dt className="text-muted-foreground">{t('pages.jobs.client_email')}</dt>
          <dd dir="ltr">{job.client_email ?? '—'}</dd>
          <dt className="text-muted-foreground">{t('pages.jobs.client_phone')}</dt>
          <dd dir="ltr">{job.client_phone ?? '—'}</dd>
          <dt className="text-muted-foreground">{t('pages.jobs.when')}</dt>
          <dd>
            {job.booked_starts_at
              ? formatAppointmentWhen(job.booked_starts_at, i18n.language)
              : t('pages.jobs.unscheduled')}
          </dd>
        </dl>
      </section>

      <JobBookingProgress job={job} />

      <JobDetailsForm job={job} />

      <JobContractCard job={job} />

      <section className="card p-4 space-y-2" aria-labelledby="job-payments-heading">
        <h2 id="job-payments-heading" className="font-semibold">
          {t('pages.jobs.payments.title')}
        </h2>
        <JobPaymentsPanel engagementId={job.engagement_id} packagePriceMinor={job.price_minor} />
      </section>
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/jobs" className="text-sm underline">
          ← {t('pages.jobs.back')}
        </Link>
      </div>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">
            {labels.engagement.singular}: {job.client_name ?? '—'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {job.package_name ?? '—'} · {price}
            {job.lead_id && <> · {t('pages.jobs.created_from_lead')}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {job.job_status !== 'cancelled' && <CreateQuoteButton engagementId={job.engagement_id} />}
          <CancelShootButton job={job} />
          <JobStatusBadge status={job.job_status} />
        </div>
      </header>

      {shopOn ? (
        <Tabs value={tab} onValueChange={(next) => setParams(next === 'details' ? {} : { tab: next }, { replace: true })}>
          <TabsList>
            {SHOOT_TABS.map((k) => (
              <TabsTrigger key={k} value={k}>{t(`pages.jobs.tabs.${k}`)}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="details" className="space-y-6 pt-4">
            {tab === 'details' && details}
          </TabsContent>
          <TabsContent value="shop" className="pt-4">
            {tab === 'shop' && <JobPhotoShopCard engagementId={job.engagement_id} />}
          </TabsContent>
          <TabsContent value="client" className="pt-4">
            {tab === 'client' && <PhotoShopPreview engagementId={job.engagement_id} />}
          </TabsContent>
        </Tabs>
      ) : (
        details
      )}
    </div>
  );
}
