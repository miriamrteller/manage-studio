import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { recordLegalAcceptance } from '@/legal/acceptance';
import { legalTextVersion } from '@/legal/render';
import { tenantHasEnrolmentTerms, useLegalDocument } from '@/legal/useLegalDocument';
import { useLegalLinks } from '@/legal/useLegalLinks';
import { isInternalLegalLink } from '@/lib/legalLinks';

export interface EnrolmentTermsConsentProps {
  engagementId: string;
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
 * Required checkbox before payment: agree to the studio's enrolment terms and
 * confirm reading its privacy policy, recorded in legal_acceptances.
 * Applies when the studio has terms — its own link (Settings → Legal) or its
 * published generated page. The version recorded is the hash of the generated
 * text, or of the link for an external page. A studio without terms yet is not
 * blocked from enrolling anyone.
 */
export function EnrolmentTermsConsent({ engagementId, acceptedByRole, children }: EnrolmentTermsConsentProps) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const links = useLegalLinks();
  const terms = useLegalDocument('enrolment-terms');
  const privacy = useLegalDocument('studio-privacy');
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const legal = terms.legal;
  const applies =
    !!tenant && !!links.terms && (legal ? tenantHasEnrolmentTerms(legal.vertical) : true);

  if (!applies || done) return <>{children}</>;

  const termsHref = links.terms as string;
  const privacyHref = links.privacy;
  const needsGenerated = isInternalLegalLink(termsHref) || (!!privacyHref && isInternalLegalLink(privacyHref));
  if (needsGenerated && (terms.isLoading || privacy.isLoading)) {
    return <p role="status">{t('common.loading')}</p>;
  }

  const versionOf = (href: string, generated: string | undefined) =>
    isInternalLegalLink(href) ? generated : `url:${legalTextVersion(href)}`;

  const handleContinue = async () => {
    if (!tenant) return;
    setSaving(true);
    try {
      const termsVersion = versionOf(termsHref, terms.doc?.version);
      if (termsVersion) {
        await recordLegalAcceptance({
          tenantId: tenant.id,
          documents: ['enrolment_terms'],
          version: termsVersion,
          language: terms.lang,
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
          language: privacy.lang,
          engagementId,
          role: acceptedByRole,
        });
      }
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
      <Button type="button" variant="primary" className="w-full" disabled={!checked || saving} onClick={handleContinue}>
        {t('legal.enrolment.continue')}
      </Button>
    </div>
  );
}
