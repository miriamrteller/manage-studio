import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { AdminEnrolmentService } from '../lib/adminEnrolmentService';
import type { Tenant } from '@shared/schemas';

export interface SendAdminWaiverLinkModalProps {
  open: boolean;
  onClose: () => void;
  tenant: Tenant;
  engagementId: string;
  studentName: string;
  className: string;
  guardianEmail?: string | null;
  guardianName?: string | null;
}

export function SendAdminWaiverLinkModal({
  open,
  onClose,
  tenant,
  engagementId,
  studentName,
  className,
  guardianEmail,
  guardianName,
}: SendAdminWaiverLinkModalProps) {
  const { t } = useTranslation();
  const [linkEmail, setLinkEmail] = useState(guardianEmail ?? '');
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [signUrl, setSignUrl] = useState<string | null>(null);
  const [linkWarning, setLinkWarning] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [showFullLink, setShowFullLink] = useState(false);

  const guardianEmailNormalized = guardianEmail?.toLowerCase() ?? '';

  useEffect(() => {
    if (!open) return;
    setLinkEmail(guardianEmail ?? '');
    setOverrideReason('');
    setError(null);
    setIsSubmitting(false);
    setDoneMessage(null);
    setSignUrl(null);
    setLinkWarning(null);
    setCopyFeedback(null);
    setShowFullLink(false);
  }, [open, guardianEmail, engagementId]);

  const handleSend = async () => {
    setError(null);
    const email = linkEmail.trim();
    if (!email) {
      setError(t('pages.admin_enrol.email_required'));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await AdminEnrolmentService.sendWaiverLinkEmail(tenant, {
        recipientEmail: email,
        recipientName: guardianName ?? studentName,
        overrideReason:
          email.toLowerCase() !== guardianEmailNormalized && guardianEmailNormalized
            ? overrideReason.trim()
            : undefined,
        engagementId,
      });

      setSignUrl(result.signUrl);
      setLinkWarning(result.warning ?? null);
      setDoneMessage(
        result.emailSent
          ? t('pages.admin_enrol.waiver_link_sent', { email })
          : t('pages.admin_enrol.waiver_link_not_emailed', { email }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t('pages.admin_enrol.waiver_link_title', { name: studentName })}
    >
      {doneMessage ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">{doneMessage}</p>
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="font-medium">{className}</p>
            <p className="text-gray-600 mt-1">{studentName}</p>
          </div>
          {linkWarning && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              {linkWarning}
            </p>
          )}
          {signUrl && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 break-all">
                {t('pages.admin_enrol.waiver_link_copy')}:{' '}
                {showFullLink || signUrl.length <= 110
                  ? signUrl
                  : `${signUrl.slice(0, 72)}...${signUrl.slice(-24)}`}
              </p>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setShowFullLink((v) => !v)}
              >
                {showFullLink ? t('common.hide', { defaultValue: 'Hide full link' }) : t('common.show', { defaultValue: 'Show full link' })}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(signUrl);
                    setCopyFeedback(t('pages.admin_enrol.link_copied', { defaultValue: 'Link copied to clipboard.' }));
                  } catch {
                    setCopyFeedback(
                      t('pages.admin_enrol.link_copy_failed', {
                        defaultValue: 'Could not copy automatically. Select and copy the link manually.',
                      }),
                    );
                  }
                }}
              >
                {t('pages.admin_enrol.copy_waiver_link_action', { defaultValue: 'Copy waiver link' })}
              </Button>
              {copyFeedback && <p className="text-xs text-gray-600">{copyFeedback}</p>}
            </div>
          )}
          <Button variant="primary" className="w-full" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="font-medium">{className}</p>
            <p className="text-gray-600 mt-1">{studentName}</p>
          </div>

          <p className="text-sm text-gray-600">{t('pages.admin_enrol.waiver_link_desc')}</p>

          <label className="block text-sm font-medium" htmlFor="waiver-link-email">
            {t('pages.admin_enrol.recipient_email')}
          </label>
          <input
            id="waiver-link-email"
            type="email"
            className="form-input w-full"
            value={linkEmail}
            onChange={(e) => setLinkEmail(e.target.value)}
            placeholder={t('pages.admin_enrol.recipient_email_placeholder')}
          />

          {guardianEmail && linkEmail.trim() && linkEmail.trim().toLowerCase() !== guardianEmailNormalized && (
            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="waiver-link-override-reason">
                {t('pages.admin_enrol.override_reason', { defaultValue: 'Reason for using a different email' })}
              </label>
              <input
                id="waiver-link-override-reason"
                type="text"
                className="form-input w-full"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={t('pages.admin_enrol.override_reason_placeholder', { defaultValue: 'Parent requested alternate email' })}
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={
                isSubmitting ||
                !linkEmail.trim() ||
                (Boolean(guardianEmail) &&
                  linkEmail.trim().toLowerCase() !== guardianEmailNormalized &&
                  !overrideReason.trim())
              }
              onClick={() => void handleSend()}
            >
              {t('pages.admin_enrol.send_waiver_link_action')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
