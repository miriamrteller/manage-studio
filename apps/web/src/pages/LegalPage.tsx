import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { renderLegalHtml } from '@/legal/render';
import {
  PLATFORM_DOCS,
  PUBLISHABLE_DOCS,
  LEGAL_PACK_DOCS,
  isLegalPackLive,
  isLegalDocId,
  tenantHasEnrolmentTerms,
  useLegalDocument,
} from '@/legal/useLegalDocument';

/**
 * /legal/:doc — a studio's legal page, generated from the templates in
 * docs/legal and the studio's details (Settings → Legal).
 */
export default function LegalPage() {
  const { doc: docParam } = useParams<{ doc: string }>();
  const { t } = useTranslation();
  const tenant = useTenant();
  const { user } = useCurrentUser();
  const docId = isLegalDocId(docParam) ? docParam : null;
  const { doc, lang, legal, isLoading, error } = useLegalDocument(docId);

  const isAdmin = !!user?.role?.includes('tenant_admin');
  const platformDoc = docId ? PLATFORM_DOCS.includes(docId) : false;
  // A new studio's pages all wait for the legal pack acknowledgement; older studios only gate these two.
  const packPending = !!legal && !isLegalPackLive(legal);
  const needsPublishing =
    !!tenant && !!docId && (PUBLISHABLE_DOCS.includes(docId) || (packPending && LEGAL_PACK_DOCS.includes(docId)));
  const notAvailable =
    !docId ||
    (!tenant && (docId === 'studio-privacy' || docId === 'enrolment-terms')) ||
    (docId === 'enrolment-terms' && legal && !tenantHasEnrolmentTerms(legal.vertical));
  const unpublished = needsPublishing && legal && (!legal.published || packPending);

  if (notAvailable) {
    return (
      <section className="max-w-3xl mx-auto py-8">
        <h1 className="text-2xl font-semibold mb-4">{t('legal.page.not_found_title')}</h1>
        <p>{t('legal.page.not_found_body')}</p>
      </section>
    );
  }

  if (isLoading) {
    return <p role="status">{t('common.loading')}</p>;
  }

  if (error || !doc) {
    return (
      <p role="alert" className="text-destructive">
        {t('legal.page.load_error')}
      </p>
    );
  }

  if (unpublished && !isAdmin) {
    return (
      <section className="max-w-3xl mx-auto py-8">
        <h1 className="text-2xl font-semibold mb-4">{t('legal.page.unpublished_title')}</h1>
        <p>{t('legal.page.unpublished_body', { email: legal?.contactEmail ?? '' })}</p>
      </section>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {isAdmin && !platformDoc && (unpublished || doc.missing.length > 0) && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="note">
          <p className="font-medium">
            {unpublished ? t('legal.page.admin_preview') : t('legal.page.admin_missing')}
          </p>
          {doc.missing.length > 0 && (
            <p className="mt-1">{t('legal.page.admin_missing_count', { count: doc.missing.length })}</p>
          )}
          <Link className="underline mt-2 inline-block" to="/admin/setup/settings?tab=legal">
            {t('legal.page.admin_edit_link')}
          </Link>
        </div>
      )}
      <article
        className="legal-document"
        lang={lang}
        dir={lang === 'he' ? 'rtl' : 'ltr'}
        // Generated from our own templates; every studio-entered value is escaped
        // and raw HTML in the templates is escaped too (see legal/render.ts).
        dangerouslySetInnerHTML={{ __html: renderLegalHtml(doc) }}
      />
    </div>
  );
}
