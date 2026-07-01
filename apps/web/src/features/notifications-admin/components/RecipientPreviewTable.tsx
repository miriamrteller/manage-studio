import { useTranslation } from 'react-i18next';
import type { BlastRecipientPreview } from '../lib/notificationBlastSchema';

interface RecipientPreviewTableProps {
  recipients: BlastRecipientPreview[];
}

export function RecipientPreviewTable({ recipients }: RecipientPreviewTableProps) {
  const { t } = useTranslation();

  if (recipients.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t('pages.notifications.preview_empty')}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium" role="status">
        {t('pages.notifications.preview_count', { count: recipients.length })}
      </p>
      <div className="overflow-x-auto border border-gray-200 rounded-md">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">{t('form.person.email')}</th>
              <th className="px-3 py-2 font-medium">{t('form.person.name')}</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((row) => (
              <tr key={`${row.person_id}-${row.recipient_email}`} className="border-t border-gray-100">
                <td className="px-3 py-2">{row.recipient_email}</td>
                <td className="px-3 py-2">{row.recipient_name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
