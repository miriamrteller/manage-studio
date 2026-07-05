import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { NotificationLog } from '@shared/schemas';
import { SortableHeader } from '@/components/shared/table';
import { Button } from '@/components/ui/button';
import {
  formatNotificationLogSentAt,
  formatNotificationLogRecipient,
  NOTIFICATION_LOG_STATUS_BADGE_CLASSES,
} from '@/features/notifications/lib/notificationLogDetail';

type NotificationSortField = 'sent_at';

interface NotificationLogTableProps {
  logs: NotificationLog[];
  sortField: NotificationSortField;
  sortOrder: 'asc' | 'desc';
  onSort: (field: NotificationSortField) => void;
  onSelectLog: (log: NotificationLog) => void;
}

function openLogFromRow(event: KeyboardEvent<HTMLTableRowElement>, log: NotificationLog, onSelect: (log: NotificationLog) => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onSelect(log);
  }
}

export function NotificationLogTable({
  logs,
  sortField,
  sortOrder,
  onSort,
  onSelectLog,
}: NotificationLogTableProps) {
  const { t } = useTranslation();

  const statusLabel = (value: string) => {
    const key = `pages.notifications.log_status_${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <SortableHeader
              label={t('pages.notifications.log_date')}
              sortKey="sent_at"
              currentField={sortField}
              currentOrder={sortOrder}
              onSort={onSort}
              className="px-4 py-2 text-left font-medium"
            />
            <th className="px-4 py-2 text-left">{t('pages.notifications.log_channel')}</th>
            <th className="px-4 py-2 text-left">{t('pages.notifications.log_recipient')}</th>
            <th className="px-4 py-2 text-left">{t('pages.notifications.log_template')}</th>
            <th className="px-4 py-2 text-left">{t('pages.notifications.log_status')}</th>
            <th className="px-4 py-2 text-left">
              <span className="sr-only">{t('pages.notifications.log_detail_view')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr
              key={log.id}
              className="border-b hover:bg-gray-50 cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => onSelectLog(log)}
              onKeyDown={(event) => openLogFromRow(event, log, onSelectLog)}
            >
              <td className="px-4 py-2">{formatNotificationLogSentAt(log) ?? '—'}</td>
              <td className="px-4 py-2">{log.channel}</td>
              <td className="px-4 py-2">
                <bdi>{formatNotificationLogRecipient(log) ?? '—'}</bdi>
              </td>
              <td className="px-4 py-2 max-w-[16rem] truncate" title={log.template_name}>
                {log.template_name}
              </td>
              <td className="px-4 py-2">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    NOTIFICATION_LOG_STATUS_BADGE_CLASSES[log.status] ?? 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {statusLabel(log.status)}
                </span>
              </td>
              <td className="px-4 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectLog(log);
                  }}
                >
                  {t('pages.notifications.log_detail_view')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
