import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { recordLegalAcceptance } from '@/legal/acceptance';
import { legalTextVersion } from '@/legal/render';
import {
  MARKETING_KINDS,
  PHOTO_KINDS,
  recordConsents,
  type ConsentState,
} from '@/legal/consents';
import { legalHasEnrolmentTerms, useLegalDocument } from '@/legal/useLegalDocument';
import { useLegalLinks } from '@/legal/useLegalLinks';
import { isInternalLegalLink } from '@/lib/legalLinks';
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

function DocLink({ href, children }: { href: string; children: ReactNode }) {
  return isInternalLegalLink(href) ? (
    <Link to={href} target="_blank" rel="noopener noreferrer" className="underline">
      {children}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
      {children}
    </a>
  );
}

/**
 * Before payment:
 *  - required: agree to the studio's enrolment terms and confirm reading its
 *    privacy policy — when the studio has terms (its own link, or its
 *    published generated page); recorded in legal_acceptances with the text
 *    version (or a hash of the link for an external page);
 *  - optional, unticked: photo/video consent per purpose and marketing opt-in
 *    per channel, each recorded with its exact wording (consent_records).
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
  const links = useLegalLinks();
  const terms = useLegalDocument('enrolment-terms');
  const privacy = useLegalDocument('studio-privacy');
  const [termsChecked, setTermsChecked] = useState(false);
  const [photo, setPhoto] = useState<ConsentState>({});
  const [marketing, setMarketing] = useState<ConsentState>({});
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const legal = terms.legal;
  const termsApply = !!tenant && !!links.terms && (legal ? legalHasEnrolmentTerms(legal) : true);
  const photoApplies = !!studentPersonId && legal?.vertical !== 'photographer';
  const marketingApplies = !!studentPersonId;

  if (!tenant || done || (!termsApply && !photoApplies && !marketingApplies)) return <>{children}</>;

  const termsHref = links.terms;
  const privacyHref = links.privacy;
  const needsGenerated =
    (!!termsHref && isInternalLegalLink(termsHref)) || (!!privacyHref && isInternalLegalLink(privacyHref));
  if (needsGenerated && (terms.isLoading || privacy.isLoading)) {
    return <p role="status">{t('common.loading')}</p>;
  }

  const lang = terms.lang;
  const vars = { student: studentName, studio: legal?.name ?? tenant.name };
  const versionOf = (href: string, generated: string | undefined) =>
    isInternalLegalLink(href) ? generated : `url:${legalTextVersion(href)}`;

  const handleContinue = async () => {
    setSaving(true);
    try {
      if (termsApply && termsHref) {
        const termsVersion = versionOf(termsHref, terms.doc?.version);
        if (termsVersion) {
          await recordLegalAcceptance({
            tenantId: tenant.id,
            documents: ['enrolment_terms'],
            version: termsVersion,
            language: lang,
            engagementId,
            role: acceptedByRole,
          });
        }
        const privacyVersion = privacyHref ? versionOf(privacyHref, privacy.doc?.version) : undefined;
        if (privacyVersion) {
          await recordLegalAcceptance({
            tenantId: tenant.id,
            documents: ['studio_privacy'],
            version: privacyVersion,
            language: lang,
            engagementId,
            role: acceptedByRole,
          });
        }
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
      {termsApply && termsHref && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={termsChecked}
            onChange={(e) => setTermsChecked(e.target.checked)}
            aria-required="true"
            data-testid="enrolment-terms-checkbox"
          />
          <span>
            {t('legal.enrolment.agree_prefix')} <DocLink href={termsHref}>{t('legal.docs.enrolment_terms')}</DocLink>
            {privacyHref && (
              <>
                {t('legal.enrolment.read_prefix')} <DocLink href={privacyHref}>{t('legal.docs.studio_privacy')}</DocLink>
              </>
            )}
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
