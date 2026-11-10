import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bug, LifeBuoy, Lightbulb, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FEEDBACK_KINDS, type FeedbackKind } from '@/lib/monitoring/sendFeedback';
import { useFeedback, useSetFeedbackStatus } from '../hooks/useFeedbackAdmin';
import {
  FEEDBACK_STATUSES,
  screenshotUrl,
  type FeedbackItem,
  type FeedbackStatus,
} from '../services/feedbackAdminService';

const KIND_ICONS: Record<FeedbackKind, LucideIcon> = { bug: Bug, idea: Lightbulb, help: LifeBuoy };

/** /platform/feedback: every bug, idea and help request studios send, for the owner to triage. */
export function FeedbackInbox() {
  const { t, i18n } = useTranslation();
  const ids = useId();
  const [kind, setKind] = useState<FeedbackKind | ''>('');
  const [status, setStatus] = useState<FeedbackStatus | ''>('');
  const feedback = useFeedback();
  const items = (feedback.data ?? []).filter((f) => (!kind || f.kind === kind) && (!status || f.status === status));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('platform_feedback.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('platform_feedback.intro')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-kind`} className="text-sm font-medium">
            {t('platform_feedback.filter_kind')}
          </label>
          <select
            id={`${ids}-kind`}
            className="form-input"
            value={kind}
            onChange={(e) => setKind(e.target.value as FeedbackKind | '')}
          >
            <option value="">{t('platform_feedback.all')}</option>
            {FEEDBACK_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`platform_feedback.kinds.${k}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-status`} className="text-sm font-medium">
            {t('platform_feedback.filter_status')}
          </label>
          <select
            id={`${ids}-status`}
            className="form-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as FeedbackStatus | '')}
          >
            <option value="">{t('platform_feedback.all')}</option>
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`platform_feedback.statuses.${s}`)}
              </option>
            ))}
          </select>
        </div>
        {feedback.data && (
          <span className="text-sm text-muted-foreground" role="status">
            {t('platform_feedback.count', { count: items.length })}
          </span>
        )}
      </div>

      {feedback.isLoading && <p role="status">{t('common.loading')}</p>}
      {feedback.isError && (
        <p role="alert" className="text-sm text-red-700">
          {t('platform_feedback.load_failed')}
        </p>
      )}
      {feedback.data && items.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          {t('platform_feedback.empty')}
        </p>
      )}

      <ul className="space-y-3">
        {items.map((item) => (
          <FeedbackCard key={item.id} item={item} locale={i18n.language} />
        ))}
      </ul>
    </div>
  );
}

function FeedbackCard({ item, locale }: { item: FeedbackItem; locale: string }) {
  const { t } = useTranslation();
  const statusId = useId();
  const setStatus = useSetFeedbackStatus();
  const [screenshotError, setScreenshotError] = useState(false);
  const Icon = KIND_ICONS[item.kind];
  const sent = new Date(item.created_at).toLocaleString(locale === 'he' ? 'he-IL' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // The tab opens on the tap itself (phones block tabs opened later), then gets the
  // one-minute private link.
  const openScreenshot = async () => {
    setScreenshotError(false);
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const url = await screenshotUrl(item.screenshot_path!);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch {
      tab?.close();
      setScreenshotError(true);
    }
  };

  const facts: Array<[string, string | null]> = [
    [t('platform_feedback.studio'), item.subdomain ? `${item.studio_name} (${item.subdomain})` : item.studio_name],
    [t('platform_feedback.industry'), item.industry],
    [t('platform_feedback.page'), item.route],
    [t('platform_feedback.from'), item.sender_email],
    [t('platform_feedback.sent_at'), sent],
  ];

  return (
    <li className="rounded-lg border border-border bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold">
          <Icon size={18} aria-hidden />
          {t(`platform_feedback.kinds.${item.kind}`)}
        </span>
        <span className="flex items-center gap-2">
          <label htmlFor={statusId} className="text-sm">
            {t('platform_feedback.status_for')}
          </label>
          <select
            id={statusId}
            className="form-input py-1"
            value={item.status}
            disabled={setStatus.isPending}
            onChange={(e) => setStatus.mutate({ id: item.id, status: e.target.value as FeedbackStatus })}
          >
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`platform_feedback.statuses.${s}`)}
              </option>
            ))}
          </select>
        </span>
      </div>
      <p className="mb-3 whitespace-pre-wrap break-words" dir="auto">
        {item.message}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-all" dir="auto">
                {v}
              </dd>
            </div>
          ))}
      </dl>
      {item.screenshot_path && (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={openScreenshot}>
          {t('platform_feedback.screenshot')}
        </Button>
      )}
      <p role="alert" className="mt-2 text-sm text-red-700">
        {screenshotError ? t('platform_feedback.screenshot_failed') : ''}
        {setStatus.isError ? t('platform_feedback.status_failed') : ''}
      </p>
    </li>
  );
}
