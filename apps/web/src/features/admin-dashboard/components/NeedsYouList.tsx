import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FEATURES, FORM_TIME_ZONE, todayIn } from '@shared/index';
import { formatCurrency } from '@shared/format';
import { useHasFeature } from '@/hooks/useHasFeature';
import { useWorkModes } from '@/hooks/useWorkModes';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useLeads } from '@/features/crm/hooks/useLeads';
import { followUpState } from '@/features/crm/lib/followUp';
import { useJobs } from '@/features/jobs/hooks/useJobs';
import { usePhotoShopEnabled, useStudioPhotoOrders } from '@/features/jobs/hooks/usePhotoShop';
import { useGalleryLastSent } from '@/features/jobs/hooks/useSendShootGallery';
import { openAmountMinor, useProjectRequests } from '@/features/jobs/lib/projectSummary';
import { useQuoteList } from '@/features/quotes/hooks/useQuotes';
import type { JobRow } from '@/features/jobs/services/jobService';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Class studios: from the classes overview the Home page already loads. */
export interface EnrolmentCounts {
  awaitingPayment: number;
  toReview: number;
}

export interface NeedsYouItem {
  key: string;
  text: string;
  to: string;
}

/**
 * Home's "Needs you" list (owner, 24 Nov 2026: Home shows what needs you today, not setup
 * cards). One line per kind of thing waiting, each a link to the page where it is done.
 * Every line follows the studio's feature set and work modes, never its business type.
 */
export function NeedsYouList({ enrolments }: { enrolments?: EnrolmentCounts }) {
  const { t } = useTranslation();
  const items = useNeedsYouItems(enrolments);

  return (
    <section aria-labelledby="needs-you-heading" className="space-y-3">
      <h1 id="needs-you-heading" className="text-2xl font-bold text-primary">
        {t('pages.admin.needs_you.title')}
      </h1>
      {items === null ? (
        <p role="status" className="text-gray-600">
          {t('common.loading')}
        </p>
      ) : items.length === 0 ? (
        <p className="card p-4 text-gray-700">{t('pages.admin.needs_you.nothing')}</p>
      ) : (
        <ul className="card divide-y divide-gray-100 p-0">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                to={item.to}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 focus-visible:bg-gray-50"
              >
                <span>{item.text}</span>
                <span aria-hidden="true" className="text-gray-400 rtl:rotate-180">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The lines, or null while loading. */
function useNeedsYouItems(enrolments: EnrolmentCounts | undefined): NeedsYouItem[] | null {
  const { t, i18n } = useTranslation();
  const { hasFeature } = useHasFeature();
  const { projects } = useWorkModes();
  const { labels } = useEntityLabels();
  const quotesOn = hasFeature(FEATURES.billing.quotes);
  const shopOn = usePhotoShopEnabled();

  const { leads, isLoading: leadsLoading } = useLeads();
  const { jobs, isLoading: jobsLoading } = useJobs({ enabled: projects });
  const { data: quotes = [], isLoading: quotesLoading } = useQuoteList();
  const { data: orders = [], isLoading: ordersLoading } = useStudioPhotoOrders();
  const liveJobs = useMemo(() => (projects ? jobs.filter((j) => j.job_status !== 'cancelled') : []), [jobs, projects]);
  const { data: requests = [] } = useProjectRequests(liveJobs.map((j) => j.engagement_id));
  const lastSent = useGalleryLastSent(liveJobs.map((j) => j.engagement_id));

  if (leadsLoading || (projects && jobsLoading) || (quotesOn && quotesLoading) || (shopOn && ordersLoading)) {
    return null;
  }

  const today = todayIn(FORM_TIME_ZONE);
  const items: NeedsYouItem[] = [];
  const add = (key: string, count: number, to: string, extra: Record<string, unknown> = {}) => {
    if (count > 0) items.push({ key, to, text: t(`pages.admin.needs_you.${key}`, { count, ...extra }) });
  };

  if (enrolments) {
    add('enrolments_to_review', enrolments.toReview, '/admin/people');
    add('enrolments_awaiting_payment', enrolments.awaitingPayment, '/admin/people');
  }

  const open = leads.filter((l) => !l.converted_account_id && l.stage !== 'won' && l.stage !== 'lost');
  add('new_leads', open.filter((l) => l.stage === 'new').length, '/admin/leads');
  add(
    'follow_ups',
    open.filter((l) => l.stage !== 'new' && followUpState(l, today) !== null).length,
    '/admin/leads',
  );

  if (quotesOn) {
    add('quotes_waiting', quotes.filter((q) => q.status === 'sent').length, '/admin/projects/quotes');
  }

  if (projects) {
    const he = i18n.language.startsWith('he');
    const word = (w: string) => (he ? w : w.toLowerCase());
    add('coming_up', liveJobs.filter((j) => isWithinAWeek(j)).length, '/admin/projects', {
      thing: word(labels.engagement.singular),
      things: word(labels.engagement.plural),
    });
    add(
      'galleries_to_send',
      liveJobs.filter((j) => (j.job_status === 'shot' || j.job_status === 'editing') && !lastSent.get(j.engagement_id))
        .length,
      '/admin/projects',
    );
  }

  if (shopOn) {
    add('orders_to_deliver', orders.filter((o) => o.status === 'paid').length, '/admin/shop/photos?tab=orders');
  }

  if (projects) {
    const owing = liveJobs.filter((j) => openAmountMinor(requests.filter((r) => r.engagement_id === j.engagement_id)) > 0);
    const total = openAmountMinor(requests.filter((r) => owing.some((j) => j.engagement_id === r.engagement_id)));
    const currency = owing[0]?.currency ?? 'ILS';
    add('money_owed', owing.length, '/admin/projects', {
      amount: formatCurrency(total, currency, i18n.language.startsWith('he') ? 'he-IL' : 'en-GB'),
    });
  }

  return items;
}

function isWithinAWeek(job: JobRow): boolean {
  if (!job.booked_starts_at) return false;
  const at = new Date(job.booked_starts_at).getTime();
  const now = Date.now();
  return at >= now && at - now <= WEEK_MS;
}
