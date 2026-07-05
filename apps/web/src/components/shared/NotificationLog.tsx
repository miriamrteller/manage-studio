import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useSortState } from '@/hooks/useSortState';
import { useNotificationLog } from '@/features/notifications/hooks/useNotificationLog';
import type { NotificationLog as NotificationLogEntry } from '@shared/schemas';
import { NotificationLogDetailDialog } from '@/components/shared/NotificationLogDetailDialog';
import { NotificationLogTable } from '@/components/shared/NotificationLogTable';

type NotificationSortField = 'sent_at';

export function NotificationLog() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'voice' | undefined>();
  const [status, setStatus] = useState<'sent' | 'delivered' | 'read' | 'failed' | 'bounced' | undefined>();
  const [recipientSearch, setRecipientSearch] = useState('');
  const [debouncedRecipientSearch, setDebouncedRecipientSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<NotificationLogEntry | null>(null);
  const { sortField, sortOrder, toggleSort } = useSortState<NotificationSortField>('sent_at', 'desc');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedRecipientSearch(recipientSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [recipientSearch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedRecipientSearch]);

  const { logs, isLoading, error, pageCount } = useNotificationLog({
    page,
    pageSize: 25,
    channel,
    status,
    sortOrder,
    recipientQuery: debouncedRecipientSearch,
  });

  const handleSort = (field: NotificationSortField) => {
    toggleSort(field, () => setPage(1));
  };

  const hasActiveSearch = debouncedRecipientSearch.trim().length > 0;
  const emptyMessage = hasActiveSearch
    ? t('pages.notifications.log_search_empty')
    : t('pages.notifications.log_empty');

  return (
    <div className="w-full space-y-4 border rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4">{t('pages.notifications.log_heading')}</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label htmlFor="recipient-search" className="block text-sm font-medium mb-2">
            {t('pages.notifications.log_search_recipient')}
          </label>
          <input
            id="recipient-search"
            type="search"
            value={recipientSearch}
            onChange={(e) => setRecipientSearch(e.target.value)}
            placeholder={t('pages.notifications.log_search_recipient_placeholder')}
            className="w-full px-3 py-2 border rounded"
            autoComplete="off"
          />
        </div>

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
        <p className="text-center py-8 text-gray-600">{emptyMessage}</p>
      ) : (
        <>
          <NotificationLogTable
            logs={logs}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onSelectLog={setSelectedLog}
          />

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

      <NotificationLogDetailDialog
        log={selectedLog}
        open={selectedLog !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null);
        }}
      />
    </div>
  );
}
