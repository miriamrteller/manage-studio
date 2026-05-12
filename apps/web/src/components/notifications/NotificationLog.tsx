import { useState } from 'react';
import { useNotificationLog } from '@/hooks/notifications';

export function NotificationLog() {
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'voice' | undefined>();
  const [status, setStatus] = useState<'sent' | 'delivered' | 'read' | 'failed' | 'bounced' | undefined>();

  const { logs, isLoading, error, pageCount } = useNotificationLog({
    page,
    pageSize: 25,
    channel,
    status,
  });

  return (
    <div className="w-full space-y-4 border rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4">Notification History</h2>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-2">Channel</label>
          <select
            value={channel || ''}
            onChange={(e) => {
              setChannel((e.target.value as 'email' | 'whatsapp' | 'voice') || undefined);
              setPage(1);
            }}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="">All Channels</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Status</label>
          <select
            value={status || ''}
            onChange={(e) => {
              setStatus((e.target.value as 'sent' | 'delivered' | 'read' | 'failed' | 'bounced') || undefined);
              setPage(1);
            }}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center py-8 text-gray-600">Loading...</p>
      ) : error ? (
        <div
          className="p-4 rounded mb-4"
          style={{
            backgroundColor: 'var(--color-error-light)',
            color: 'var(--color-error)',
          }}
        >
          {typeof error === 'string' ? error : 'Failed to load notification log'}
        </div>
      ) : logs.length === 0 ? (
        <p className="text-center py-8 text-gray-600">No notifications found</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Channel</th>
                  <th className="px-4 py-2 text-left">Recipient</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">
                      {new Date(log.sent_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{log.channel}</td>
                    <td className="px-4 py-2">
                      {log.recipient_email || log.recipient_phone}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{
                          backgroundColor:
                            log.status === 'sent' || log.status === 'delivered'
                              ? 'var(--color-success-light)'
                              : 'var(--color-error-light)',
                          color:
                            log.status === 'sent' || log.status === 'delivered'
                              ? 'var(--color-success)'
                              : 'var(--color-error)',
                        }}
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-4">
                Page {page} of {pageCount}
              </span>
              <button
                onClick={() => setPage(Math.min(pageCount, page + 1))}
                disabled={page === pageCount}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
