import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { recordLegalAcceptance } from '@/legal/acceptance';
import { tenantHasEnrolmentTerms, useLegalDocument } from '@/legal/useLegalDocument';

export interface EnrolmentTermsConsentProps {
  engagementId: string;
  /** 'guardian' when a parent enrols a child under 18. */
  acceptedByRole: 'self' | 'guardian';
  children: ReactNode;
}

/**
 * Required checkbox before payment: agree to the studio's enrolment terms and
 * confirm reading its privacy policy. Recorded with the exact text version.
 * Shown only once the studio has published its legal pages — a studio can't
 * ask anyone to agree to terms it hasn't published yet.
 */
export function EnrolmentTermsConsent({ engagementId, acceptedByRole, children }: EnrolmentTermsConsentProps) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const terms = useLegalDocument('enrolment-terms');
  const privacy = useLegalDocument('studio-privacy');
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const legal = terms.legal;
  const applies = !!tenant && !!legal?.published && tenantHasEnrolmentTerms(legal.vertical);

  if (!applies || done) return <>{children}</>;

  if (terms.isLoading || privacy.isLoading) {
    return <p role="status">{t('common.loading')}</p>;
  }

  const handleContinue = async () => {
    if (!tenant || !terms.doc || !privacy.doc) return;
    setSaving(true);
    try {
      await recordLegalAcceptance({
        tenantId: tenant.id,
        documents: ['enrolment_terms'],
        version: terms.doc.version,
        language: terms.lang,
        engagementId,
        role: acceptedByRole,
      });
      await recordLegalAcceptance({
        tenantId: tenant.id,
        documents: ['studio_privacy'],
        version: privacy.doc.version,
        language: privacy.lang,
        engagementId,
        role: acceptedByRole,
      });
    } catch (err) {
      // The parent did tick the box; don't block the enrolment on a logging failure.
      console.warn('[EnrolmentTermsConsent] could not record acceptance', err);
    } finally {
      setSaving(false);
      setDone(true);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
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
      <Button type="button" variant="primary" className="w-full" disabled={!checked || saving} onClick={handleContinue}>
        {t('legal.enrolment.continue')}
      </Button>
    </div>
  );
}
