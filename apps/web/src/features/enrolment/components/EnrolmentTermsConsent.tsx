import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { recordLegalAcceptance } from '@/legal/acceptance';
import {
  MARKETING_KINDS,
  PHOTO_KINDS,
  recordConsents,
  type ConsentState,
} from '@/legal/consents';
import { tenantHasEnrolmentTerms, useLegalDocument } from '@/legal/useLegalDocument';
import { ConsentCheckboxes } from '@/components/legal/ConsentCheckboxes';

export interface EnrolmentTermsConsentProps {
  engagementId: string;
  /** The student being enrolled (photo consent is recorded for them). */
  studentPersonId?: string | null;
  studentName?: string;
  /** 'guardian' when a parent enrols a child under 18. */
  acceptedByRole: 'self' | 'guardian';
  children: ReactNode;
}

/**
 * Before payment:
 *  - required: agree to the studio's enrolment terms + read its privacy policy
 *    (only once the studio has published them), recorded with the text version;
 *  - optional, unticked: photo/video consent per purpose and marketing opt-in
 *    per channel, each recorded with its exact wording.
 * Marketing for a child is recorded against the parent (record_consents).
 */
export function EnrolmentTermsConsent({
  engagementId,
  studentPersonId,
  studentName,
  acceptedByRole,
  children,
}: EnrolmentTermsConsentProps) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const terms = useLegalDocument('enrolment-terms');
  const privacy = useLegalDocument('studio-privacy');
  const [termsChecked, setTermsChecked] = useState(false);
  const [photo, setPhoto] = useState<ConsentState>({});
  const [marketing, setMarketing] = useState<ConsentState>({});
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const legal = terms.legal;
  const termsApply = !!tenant && !!legal?.published && tenantHasEnrolmentTerms(legal.vertical);
  const photoApplies = !!studentPersonId && legal?.vertical !== 'photographer';
  const marketingApplies = !!studentPersonId;

  if (!tenant || done || (!termsApply && !photoApplies && !marketingApplies)) return <>{children}</>;

  if (terms.isLoading || privacy.isLoading) {
    return <p role="status">{t('common.loading')}</p>;
  }

  const lang = terms.lang;
  const vars = { student: studentName, studio: legal?.name ?? tenant.name };

  const handleContinue = async () => {
    setSaving(true);
    try {
      if (termsApply && terms.doc && privacy.doc) {
        await recordLegalAcceptance({
          tenantId: tenant.id,
          documents: ['enrolment_terms'],
          version: terms.doc.version,
          language: lang,
          engagementId,
          role: acceptedByRole,
        });
        await recordLegalAcceptance({
          tenantId: tenant.id,
          documents: ['studio_privacy'],
          version: privacy.doc.version,
          language: lang,
          engagementId,
          role: acceptedByRole,
        });
      }
      if (studentPersonId) {
        const items = [
          ...(photoApplies ? PHOTO_KINDS.map((kind) => ({ kind, granted: photo[kind] === true })) : []),
          // Record only channels the person opted in to; not ticking isn't a "no" to store.
          ...MARKETING_KINDS.filter((kind) => marketing[kind] === true).map((kind) => ({ kind, granted: true })),
        ];
        await recordConsents({
          tenantId: tenant.id,
          personId: studentPersonId,
          items,
          lang,
          vars,
          source: 'enrolment',
          engagementId,
        });
      }
    } catch (err) {
      // The parent did tick the boxes; don't block the enrolment on a logging failure.
      console.warn('[EnrolmentTermsConsent] could not record acceptance/consents', err);
    } finally {
      setSaving(false);
      setDone(true);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      {termsApply && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={termsChecked}
            onChange={(e) => setTermsChecked(e.target.checked)}
            data-testid="enrolment-terms-checkbox"
          />
          <span>
            {t('legal.enrolment.agree_prefix')}{' '}
            <Link to="/legal/enrolment-terms" target="_blank" rel="noopener noreferrer" className="underline">
              {t('legal.docs.enrolment_terms')}
            </Link>
            {t('legal.enrolment.read_prefix')}{' '}
            <Link to="/legal/studio-privacy" target="_blank" rel="noopener noreferrer" className="underline">
              {t('legal.docs.studio_privacy')}
            </Link>
            .
          </span>
        </label>
      )}

      {photoApplies && (
        <ConsentCheckboxes
          legend={t('legal.consents.photo_legend')}
          hint={t('legal.consents.photo_hint')}
          preface={acceptedByRole === 'guardian' ? t('legal.consents.guardian_preface', { name: studentName ?? '' }) : undefined}
          kinds={PHOTO_KINDS}
          value={photo}
          onChange={setPhoto}
          lang={lang}
          vars={vars}
        />
      )}

      {marketingApplies && (
        <ConsentCheckboxes
          legend={t('legal.consents.marketing_legend')}
          kinds={MARKETING_KINDS}
          value={marketing}
          onChange={setMarketing}
          lang={lang}
          vars={vars}
        />
      )}

      <Button
        type="button"
        variant="primary"
        className="w-full"
        disabled={(termsApply && !termsChecked) || saving}
        onClick={handleContinue}
      >
        {t('legal.enrolment.continue')}
      </Button>
    </div>
  );
}
