import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatPersonDateOfBirthDisplay } from '@/lib/personAge';
import {
  approveAgeReviewEngagement,
  declineAgeReviewEngagement,
  mapAgeReviewRpcError,
} from '@/features/enrolment/lib/ageReviewService';
import {
  notifyParentAgeReviewApproved,
  notifyParentAgeReviewDeclined,
} from '@/features/enrolment/lib/sendAgeReviewNotifications';
import { resolveGuardianEmail } from '@/features/enrolment/lib/resolveGuardianEmail';
import { useTenant } from '@/hooks/useTenant';
import type { Engagement, Person } from '@shared/schemas';

export interface AgeReviewEngagementDetails {
  engagement: Engagement;
  className: string;
  classAges: string | null;
  student: Person;
  guardian?: Person | null;
}

interface AgeReviewAdminPanelProps {
  details: AgeReviewEngagementDetails;
  highlighted?: boolean;
  onUpdated: () => void;
}

export function AgeReviewAdminPanel({
  details,
  highlighted = false,
  onUpdated,
}: AgeReviewAdminPanelProps) {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const { engagement, className, classAges, student, guardian } = details;

  const [approveOpen, setApproveOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [adminReason, setAdminReason] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const handleApprove = async () => {
    if (!tenant) return;
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      await approveAgeReviewEngagement(engagement.id, adminReason.trim() || undefined);

      const guardianEmail = resolveGuardianEmail({
        person: student,
        guardian: guardian ?? undefined,
      });
      if (guardianEmail) {
        await notifyParentAgeReviewApproved(tenant, {
          engagementId: engagement.id,
          recipientEmail: guardianEmail,
          recipientName: guardian?.name ?? student.name,
          studentName: student.name,
          className,
        });
      }

      setApproveOpen(false);
      setAdminReason('');
      onUpdated();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorKey(mapAgeReviewRpcError(message));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!tenant) return;
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      await declineAgeReviewEngagement(engagement.id, declineReason.trim() || undefined);

      const guardianEmail = resolveGuardianEmail({
        person: student,
        guardian: guardian ?? undefined,
      });
      if (guardianEmail) {
        await notifyParentAgeReviewDeclined(tenant, {
          recipientEmail: guardianEmail,
          recipientName: guardian?.name ?? student.name,
          studentName: student.name,
          className,
          declineReason: declineReason.trim() || null,
        });
      }

      setDeclineOpen(false);
      setDeclineReason('');
      onUpdated();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorKey(mapAgeReviewRpcError(message));
    } finally {
      setIsSubmitting(false);
    }
  };

  const errorMessage = errorKey ? t(errorKey) : null;

  return (
    <div
      className={[
        'rounded-md border border-amber-300 bg-amber-50 p-4 text-sm space-y-3',
        highlighted ? 'ring-2 ring-amber-500' : '',
      ].join(' ')}
      data-engagement-id={engagement.id}
    >
      <h4 className="font-semibold text-amber-950">{t('pages.enrolment.age_review_admin_title')}</h4>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-amber-950">
        <div>
          <dt className="text-xs uppercase tracking-wide opacity-70">{t('form.person.name')}</dt>
          <dd>{student.name}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide opacity-70">{t('form.person.date_of_birth')}</dt>
          <dd>
            {student.date_of_birth
              ? formatPersonDateOfBirthDisplay(student.date_of_birth, t, i18n.language)
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide opacity-70">{t('pages.classes.ages')}</dt>
          <dd>
            {engagement.age_at_season_start != null
              ? `${engagement.age_at_season_start}${classAges ? ` / ${classAges}` : ''}`
              : classAges ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide opacity-70">{t('pages.enrolment.class_label')}</dt>
          <dd>{className}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs uppercase tracking-wide opacity-70">
            {t('pages.enrolment.age_review_note_label')}
          </dt>
          <dd className="whitespace-pre-wrap">{engagement.age_review_note ?? '—'}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" size="sm" onClick={() => setApproveOpen(true)}>
          {t('pages.enrolment.age_review_approve')}
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={() => setDeclineOpen(true)}>
          {t('pages.enrolment.age_review_decline')}
        </Button>
      </div>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('pages.enrolment.age_review_approve')}</DialogTitle>
            <DialogDescription>{className}</DialogDescription>
          </DialogHeader>
          <textarea
            className="form-input w-full"
            rows={3}
            maxLength={500}
            value={adminReason}
            onChange={(e) => setAdminReason(e.target.value)}
            placeholder={t('pages.enrolment.age_override_reason_placeholder')}
            disabled={isSubmitting}
          />
          {errorMessage && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setApproveOpen(false)} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" onClick={handleApprove} isLoading={isSubmitting}>
              {t('pages.enrolment.age_review_approve')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('pages.enrolment.age_review_decline')}</DialogTitle>
            <DialogDescription>{t('pages.enrolment.age_review_decline_confirm')}</DialogDescription>
          </DialogHeader>
          <textarea
            className="form-input w-full"
            rows={3}
            maxLength={500}
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder={t('pages.students.cancel_enrolment_reason_placeholder')}
            disabled={isSubmitting}
          />
          {errorMessage && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeclineOpen(false)} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={handleDecline} isLoading={isSubmitting}>
              {t('pages.enrolment.age_review_decline')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
