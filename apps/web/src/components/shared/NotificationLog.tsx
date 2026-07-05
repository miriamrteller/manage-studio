import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SortableHeader } from '@/components/shared/table';
import { useSortState } from '@/hooks/useSortState';
import { useNotificationLog } from '@/features/notifications/hooks/useNotificationLog';

type NotificationSortField = 'sent_at';

const STATUS_BADGE_CLASSES: Record<string, string> = {
  sent: 'bg-green-100 text-green-800',
  delivered: 'bg-green-100 text-green-800',
  read: 'bg-blue-100 text-blue-800',
  pending: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
  bounced: 'bg-red-100 text-red-800',
};

export function NotificationLog() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'voice' | undefined>();
  const [status, setStatus] = useState<'sent' | 'delivered' | 'read' | 'failed' | 'bounced' | undefined>();
  const { sortField, sortOrder, toggleSort } = useSortState<NotificationSortField>('sent_at', 'desc');

  const { logs, isLoading, error, pageCount } = useNotificationLog({
    page,
    pageSize: 25,
    channel,
    status,
    sortOrder,
  });

  const handleSort = (field: NotificationSortField) => {
    toggleSort(field, () => setPage(1));
  };

  const statusLabel = (value: string) => {
    const key = `pages.notifications.log_status_${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
  };

  return (
    <div className="w-full space-y-4 border rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4">{t('pages.notifications.log_heading')}</h2>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label htmlFor="channel-select" className="block text-sm font-medium mb-2">
            {t('pages.notifications.log_channel')}
          </label>
          <select
            id="channel-select"
            value={channel || ''}
            onChange={(e) => {
              setChannel((e.target.value as 'email' | 'whatsapp' | 'voice') || undefined);
              setPage(1);
            }}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="">{t('pages.notifications.log_channel_all')}</option>
            <option value="email">{t('pages.notifications.log_channel_email')}</option>
            <option value="whatsapp">{t('pages.notifications.log_channel_whatsapp')}</option>
          </select>
        </div>

        <div>
          <label htmlFor="status-select" className="block text-sm font-medium mb-2">
            {t('pages.notifications.log_status')}
          </label>
          <select
            id="status-select"
            value={status || ''}
            onChange={(e) => {
              setStatus((e.target.value as 'sent' | 'delivered' | 'read' | 'failed' | 'bounced') || undefined);
              setPage(1);
            }}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="">{t('pages.notifications.log_status_all')}</option>
            <option value="sent">{t('pages.notifications.log_status_sent')}</option>
            <option value="delivered">{t('pages.notifications.log_status_delivered')}</option>
            <option value="failed">{t('pages.notifications.log_status_failed')}</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center py-8 text-gray-600">{t('pages.notifications.log_loading')}</p>
      ) : error ? (
        <div className="alert-error" role="alert">
          {typeof error === 'string' ? error : t('pages.notifications.log_error')}
        </div>
      ) : logs.length === 0 ? (
        <p className="text-center py-8 text-gray-600">{t('pages.notifications.log_empty')}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <SortableHeader
                    label={t('pages.notifications.log_date')}
                    sortKey="sent_at"
                    currentField={sortField}
                    currentOrder={sortOrder}
                    onSort={handleSort}
                    className="px-4 py-2 text-left font-medium"
                  />
                  <th className="px-4 py-2 text-left">{t('pages.notifications.log_channel')}</th>
                  <th className="px-4 py-2 text-left">{t('pages.notifications.log_recipient')}</th>
                  <th className="px-4 py-2 text-left">{t('pages.notifications.log_template')}</th>
                  <th className="px-4 py-2 text-left">{t('pages.notifications.log_status')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const at = log.sent_at ?? log.created_at;
                  return (
                    <tr key={log.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2">{at ? new Date(at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-2">{log.channel}</td>
                      <td className="px-4 py-2">{log.recipient_email || log.recipient_phone}</td>
                      <td className="px-4 py-2 max-w-[16rem] truncate" title={log.template_name}>
                        {log.template_name}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            STATUS_BADGE_CLASSES[log.status] ?? 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {statusLabel(log.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
              >
                {t('pages.notifications.log_previous')}
              </Button>
              <span className="px-4">
                {t('pages.notifications.log_page', { page, pageCount })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.min(pageCount, page + 1))}
                disabled={page === pageCount}
              >
                {t('pages.notifications.log_next')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
