import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { FormInput } from '@/components/ui/form';
import type { BlastRecipientPreview } from '../lib/notificationBlastSchema';
import {
  isHumanRecipientSearchQuery,
  matchesHumanRecipientSearch,
  normalizeRecipientEmail,
} from '../lib/recipientHumanSearch';

interface RecipientPreviewTableProps {
  recipients: BlastRecipientPreview[];
  selectedEmails: Set<string>;
  onSelectedEmailsChange: (emails: Set<string>) => void;
}

export function RecipientPreviewTable({
  recipients,
  selectedEmails,
  onSelectedEmailsChange,
}: RecipientPreviewTableProps) {
  const { t } = useTranslation();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const visibleRecipients = recipients.filter((row) =>
    matchesHumanRecipientSearch(row, searchQuery),
  );

  const selectedCount = recipients.filter((row) =>
    selectedEmails.has(normalizeRecipientEmail(row.recipient_email)),
  ).length;
  const allVisibleSelected =
    visibleRecipients.length > 0 &&
    visibleRecipients.every((row) =>
      selectedEmails.has(normalizeRecipientEmail(row.recipient_email)),
    );
  const someVisibleSelected = visibleRecipients.some((row) =>
    selectedEmails.has(normalizeRecipientEmail(row.recipient_email)),
  );

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [allVisibleSelected, someVisibleSelected]);

  if (recipients.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t('pages.notifications.preview_empty')}
      </p>
    );
  }

  const toggleAllVisible = (checked: boolean) => {
    const next = new Set(selectedEmails);
    for (const row of visibleRecipients) {
      const emailKey = normalizeRecipientEmail(row.recipient_email);
      if (checked) {
        next.add(emailKey);
      } else {
        next.delete(emailKey);
      }
    }
    onSelectedEmailsChange(next);
  };

  const toggleOne = (email: string, checked: boolean) => {
    const emailKey = normalizeRecipientEmail(email);
    const next = new Set(selectedEmails);
    if (checked) {
      next.add(emailKey);
    } else {
      next.delete(emailKey);
    }
    onSelectedEmailsChange(next);
  };

  const searchLooksLikeId = searchQuery.trim().length > 0 && !isHumanRecipientSearchQuery(searchQuery);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium" role="status">
        {t('pages.notifications.preview_selected_count', {
          selected: selectedCount,
          total: recipients.length,
        })}
      </p>

      <FormInput
        htmlFor="blast-recipient-list-search"
        label={t('pages.notifications.recipient_list_search_label')}
        placeholder={t('pages.notifications.recipient_list_search_placeholder')}
        helperText={t('pages.notifications.recipient_list_search_helper')}
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />

      {searchLooksLikeId ? (
        <p className="text-sm text-destructive" role="alert">
          {t('pages.notifications.recipient_list_search_id_rejected')}
        </p>
      ) : searchQuery.trim() && visibleRecipients.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t('pages.notifications.recipient_list_search_empty')}
        </p>
      ) : (
        <>
          {searchQuery.trim() && (
            <p className="text-sm text-muted-foreground">
              {t('pages.notifications.recipient_list_search_results', {
                count: visibleRecipients.length,
                total: recipients.length,
              })}
            </p>
          )}
          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      ref={selectAllRef}
                      checked={allVisibleSelected}
                      onCheckedChange={toggleAllVisible}
                      aria-label={t('pages.notifications.preview_select_all')}
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">{t('form.person.name')}</th>
                  <th className="px-3 py-2 font-medium">{t('form.person.email')}</th>
                  <th className="px-3 py-2 font-medium">{t('pages.notifications.family_column')}</th>
                  <th className="px-3 py-2 font-medium">{t('pages.notifications.classes_column')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecipients.map((row) => {
                  const emailKey = normalizeRecipientEmail(row.recipient_email);
                  const checked = selectedEmails.has(emailKey);
                  return (
                    <tr key={emailKey} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggleOne(row.recipient_email, value)}
                          aria-label={row.recipient_name ?? row.recipient_email}
                        />
                      </td>
                      <td className="px-3 py-2">{row.recipient_name ?? '—'}</td>
                      <td className="px-3 py-2">{row.recipient_email}</td>
                      <td className="px-3 py-2">{row.account_name ?? '—'}</td>
                      <td className="px-3 py-2">{row.class_names ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
