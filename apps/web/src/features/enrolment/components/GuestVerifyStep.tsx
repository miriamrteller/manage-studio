import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface GuestVerifyStepProps {
  /** Email the guest entered during the person step */
  guestEmail: string | null;
  onContinue: () => void;
  onPrevious: () => void;
  canGoBack: boolean;
}

/**
 * GuestVerifyStep — shown to unauthenticated guests when the class requires a waiver.
 *
 * Informs the guest that:
 *   1. A legally-binding waiver must be signed before their enrollment is active.
 *   2. A link to sign the waiver will be emailed after payment.
 *   3. Classes attended before signing are at their own risk; missed classes while
 *      the waiver is pending are NOT eligible for refund, credit, or makeup.
 *   4. If the waiver is not signed within 7 days, the enrollment is auto-cancelled
 *      and a full refund is issued.
 *
 * The guest must check the acknowledgment box before proceeding to payment.
 * This creates a consent audit trail for the pre-payment disclosure.
 */
export function GuestVerifyStep({
  guestEmail,
  onContinue,
  onPrevious,
  canGoBack,
}: GuestVerifyStepProps) {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="space-y-6">
      {/* Warning banner */}
      <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-5">
        <h3 className="text-base font-bold text-amber-900 mb-2">
          {t('pages.enrolment.guest_waiver_heading')}
        </h3>
        <p className="text-sm text-amber-800 leading-relaxed mb-3">
          {t('pages.enrolment.guest_waiver_intro')}
        </p>

        <ul className="text-sm text-amber-800 space-y-2 list-none">
          <li className="flex gap-2">
            <span className="shrink-0 font-bold">•</span>
            <span>{t('pages.enrolment.guest_waiver_point_inactive')}</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 font-bold">•</span>
            <span>{t('pages.enrolment.guest_waiver_point_no_attend')}</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 font-bold">•</span>
            <span>{t('pages.enrolment.guest_waiver_point_no_refund')}</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 font-bold">•</span>
            <span>{t('pages.enrolment.guest_waiver_point_auto_cancel')}</span>
          </li>
        </ul>
      </div>

      {/* How it works */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm font-semibold text-blue-900 mb-1">
          {t('pages.enrolment.guest_waiver_how_it_works_heading')}
        </p>
        <p className="text-sm text-blue-800 leading-relaxed">
          {t('pages.enrolment.guest_waiver_how_it_works_body', {
            email: guestEmail ?? t('pages.enrolment.guest_waiver_your_email'),
          })}
        </p>
      </div>

      {/* Acknowledgment */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          aria-label={t('pages.enrolment.guest_waiver_ack_label')}
        />
        <span className="text-sm text-gray-800 leading-relaxed">
          {t('pages.enrolment.guest_waiver_ack_text')}
        </span>
      </label>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        {canGoBack && (
          <Button type="button" variant="secondary" onClick={onPrevious} className="flex-1">
            {t('common.back')}
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          onClick={onContinue}
          disabled={!acknowledged}
          className="flex-1"
        >
          {t('pages.enrolment.guest_waiver_continue_btn')}
        </Button>
      </div>
    </div>
  );
}
