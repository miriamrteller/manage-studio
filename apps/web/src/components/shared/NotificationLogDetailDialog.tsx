import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { NotificationLog } from '@shared/schemas';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  formatNotificationLogRecipient,
  formatNotificationLogSentAt,
  isNotificationBodyRedacted,
  NOTIFICATION_LOG_STATUS_BADGE_CLASSES,
  resolveNotificationLogBody,
  resolveNotificationLogSubject,
} from '@/features/notifications/lib/notificationLogDetail';

interface NotificationLogDetailDialogProps {
  log: NotificationLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationLogDetailDialog({
  log,
  open,
  onOpenChange,
}: NotificationLogDetailDialogProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const statusLabel = (value: string) => {
    const key = `pages.notifications.log_status_${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
  };

  if (!log) return null;

  const subject = resolveNotificationLogSubject(log);
  const body = resolveNotificationLogBody(log);
  const redacted = isNotificationBodyRedacted(log.template_name);
  const showFailure =
    (log.status === 'failed' || log.status === 'bounced') && log.failure_reason?.trim();

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('pages.notifications.log_detail_title')}</DialogTitle>
        </DialogHeader>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm mb-4">
          <div>
            <dt className="font-medium text-gray-600">{t('pages.notifications.log_detail_recipient')}</dt>
            <dd className="mt-0.5">
              <bdi>{formatNotificationLogRecipient(log) ?? '—'}</bdi>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">{t('pages.notifications.log_detail_sent_at')}</dt>
            <dd className="mt-0.5">{formatNotificationLogSentAt(log) ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">{t('pages.notifications.log_channel')}</dt>
            <dd className="mt-0.5">{log.channel}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">{t('pages.notifications.log_template')}</dt>
            <dd className="mt-0.5 break-all">{log.template_name}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">{t('pages.notifications.log_status')}</dt>
            <dd className="mt-0.5">
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  NOTIFICATION_LOG_STATUS_BADGE_CLASSES[log.status] ?? 'bg-gray-100 text-gray-800'
                }`}
              >
                {statusLabel(log.status)}
              </span>
            </dd>
          </div>
        </dl>

        <div className="space-y-4 border-t pt-4">
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">
              {t('pages.notifications.log_detail_subject')}
            </p>
            <p className="text-sm">{subject ?? '—'}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">
              {t('pages.notifications.log_detail_body')}
            </p>
            {redacted ? (
              <p className="text-sm text-gray-600">{t('pages.notifications.log_detail_body_redacted')}</p>
            ) : body ? (
              <pre className="text-sm whitespace-pre-wrap font-sans bg-gray-50 border rounded p-3 max-h-64 overflow-y-auto">
                {body}
              </pre>
            ) : (
              <p className="text-sm text-gray-600">{t('pages.notifications.log_detail_body_unavailable')}</p>
            )}
          </div>

          {showFailure ? (
            <div className="alert-error text-sm" role="alert">
              <p className="font-medium">{t('pages.notifications.log_detail_failure')}</p>
              <p className="mt-1">{log.failure_reason}</p>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('pages.notifications.log_detail_close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
