import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { buildPaymentLink } from '../lib/adminEnrolmentService';
import type { Engagement } from '@shared/schemas';
import type { AdminPaymentChoice } from './AdminEnrolmentPaymentStep';

export interface StepConfirmationProps {
  enrolment: Engagement;
  className: string;
  location?: string | null;
  guardianEmail?: string | null;
  adminDoneMessage?: string | null;
  adminPaymentChoice?: AdminPaymentChoice | null;
  adminCompletionLink?: string | null;
  adminLinkEmailSent?: boolean | null;
  adminLinkWarning?: string | null;
  adminEngagementId?: string | null;
  closeLabel?: string;
  onClose: () => void;
}

export function StepConfirmation({
  enrolment,
  className,
  location,
  guardianEmail,
  adminDoneMessage,
  adminPaymentChoice,
  adminCompletionLink,
  adminLinkEmailSent,
  adminLinkWarning,
  adminEngagementId,
  closeLabel,
  onClose,
}: StepConfirmationProps) {
  const { t } = useTranslation();
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  if (adminDoneMessage) {
    const adminSendLinkFlow = adminPaymentChoice === 'send_link';
    const emailFailed = adminSendLinkFlow && adminLinkEmailSent === false;
    const adminIcon = emailFailed ? 'ℹ️' : adminSendLinkFlow ? '⏳' : '✅';
    const pendingFinalizationMessage = t('pages.admin_enrol.pending_finalization_notice', {
      defaultValue:
        'Enrolment is not final yet. It becomes final only after the waiver is signed and payment is completed.',
    });

    return (
      <div className="space-y-4 text-center">
        <div className="text-5xl mb-4">{adminIcon}</div>
        <h3 className="text-lg font-semibold">{t('pages.admin_enrol.done_title')}</h3>
        <p className="text-gray-600">{adminDoneMessage}</p>
        {adminSendLinkFlow && (
          <div
            className={[
              'rounded-lg border p-3 text-sm text-start space-y-1',
              emailFailed
                ? 'border-red-300 bg-red-50 text-red-900'
                : 'border-amber-300 bg-amber-50 text-amber-900',
            ].join(' ')}
            role="status"
          >
            <p className="font-semibold">
              {emailFailed
                ? t('pages.admin_enrol.email_not_sent_heading', {
                    defaultValue: 'Email was not sent.',
                  })
                : t('pages.admin_enrol.email_sent_pending_heading', {
                    defaultValue: 'Completion link sent. Enrolment still pending.',
                  })}
            </p>
            <p>{pendingFinalizationMessage}</p>
            {adminLinkWarning && <p className="text-xs">{adminLinkWarning}</p>}
          </div>
        )}
        {adminPaymentChoice === 'send_link' && adminEngagementId && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 break-all text-start">
              {t('pages.admin_enrol.link_copy')}:{' '}
              {adminCompletionLink ?? buildPaymentLink(adminEngagementId)}
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    adminCompletionLink ?? buildPaymentLink(adminEngagementId),
                  );
                  setCopyFeedback(
                    t('pages.admin_enrol.link_copied', {
                      defaultValue: 'Completion link copied to clipboard.',
                    }),
                  );
                } catch {
                  setCopyFeedback(
                    t('pages.admin_enrol.link_copy_failed', {
                      defaultValue: 'Could not copy automatically. Select and copy the link manually.',
                    }),
                  );
                }
              }}
            >
              {t('pages.admin_enrol.copy_link_action', { defaultValue: 'Copy completion link' })}
            </Button>
            {copyFeedback && <p className="text-xs text-gray-600">{copyFeedback}</p>}
          </div>
        )}
        <Button type="button" onClick={onClose} variant="primary" className="w-full">
          {t('common.done') || 'Done'}
        </Button>
      </div>
    );
  }

  const isPendingWaiver = enrolment.status === 'pending_waiver';

  return (
    <div className="space-y-4 text-center">
      <div className="text-5xl mb-4">{isPendingWaiver ? '⚠️' : '✅'}</div>
      <h3 className="text-lg font-semibold">
        {isPendingWaiver
          ? t('pages.enrolment.confirmation_title_pending_waiver')
          : t('pages.enrolment.confirmation_title')}
      </h3>
      <p className="text-gray-600">
        {isPendingWaiver
          ? t('pages.enrolment.confirmation_desc_pending_waiver')
          : t('pages.enrolment.confirmation_desc')}
      </p>

      {isPendingWaiver && guardianEmail && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 text-start space-y-2">
          <p className="font-bold">{t('pages.enrolment.pending_waiver_heading')}</p>
          <p>{t('pages.enrolment.pending_waiver_email_hint', { email: guardianEmail })}</p>
          <p className="text-xs text-amber-800">{t('pages.enrolment.pending_waiver_legal_notice')}</p>
        </div>
      )}

      {!isPendingWaiver && guardianEmail && (
        <p className="text-sm text-gray-600">
          {t('pages.enrolment.confirmation_portal_hint', { email: guardianEmail })}
        </p>
      )}

      <div className="p-4 bg-blue-50 rounded-lg text-sm space-y-2 text-start">
        <p>
          <strong>{t('pages.enrolment.class_label')}:</strong> {className || enrolment.offering_id}
        </p>
        {location && (
          <p>
            <strong>{t('pages.enrolment.location_label')}:</strong> {location}
          </p>
        )}
        <p>
          <strong>{t('pages.enrolment.status_label')}:</strong> {enrolment.status}
        </p>
        <p>
          <strong>{t('pages.enrolment.date_label')}:</strong>{' '}
          {new Date(enrolment.created_at).toLocaleDateString()}
        </p>
      </div>

      <Button type="button" onClick={onClose} variant="primary" className="w-full">
        {closeLabel ?? t('common.done') ?? 'Done'}
      </Button>
    </div>
  );
}
