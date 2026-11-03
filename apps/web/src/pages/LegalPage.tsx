import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { fillLiveDetails, renderLegalHtml } from '@/legal/render';
import { lawyerPdfUrl, useLawyerDocuments, type LawyerDocument } from '@/legal/lawyerDocuments';
import {
  PLATFORM_DOCS,
  PUBLISHABLE_DOCS,
  LEGAL_PACK_DOCS,
  isLegalPackLive,
  isLegalDocId,
  studioRenderContext,
  tenantHasEnrolmentTerms,
  useLegalDocument,
  type TenantLegalProfile,
} from '@/legal/useLegalDocument';
import type { LegalDocId } from '@/legal/fields';

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
  const platformPage = docId ? PLATFORM_DOCS.includes(docId) : true;
  const { data: uploads, isLoading: uploadsLoading } = useLawyerDocuments(
    !platformPage && legal ? legal.tenantId : undefined,
  );
  const lawyerVersion = uploads?.find((u) => u.document === docId) ?? null;

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

  if (isLoading || (!platformPage && !!legal && uploadsLoading)) {
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
      {lawyerVersion ? (
        <LawyerVersion version={lawyerVersion} legal={legal ?? null} docId={docId} />
      ) : (
        <article
          className="legal-document"
          lang={lang}
          dir={lang === 'he' ? 'rtl' : 'ltr'}
          // Generated from our own templates; every studio-entered value is escaped
          // and raw HTML in the templates is escaped too (see legal/render.ts).
          dangerouslySetInnerHTML={{ __html: renderLegalHtml(doc) }}
        />
      )}
    </div>
  );
}

/** The studio's lawyer-reviewed version: its edited text, or its PDF. */
function LawyerVersion({
  version,
  legal,
  docId,
}: {
  version: LawyerDocument;
  legal: TenantLegalProfile | null;
  docId: LegalDocId;
}) {
  const { t, i18n } = useTranslation();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  const date = new Intl.DateTimeFormat(i18n.language?.startsWith('he') ? 'he-IL' : 'en-GB', { dateStyle: 'medium' }).format(
    new Date(version.uploadedAt),
  );

  async function openPdf() {
    if (!version.storagePath) return;
    setOpening(true);
    setFailed(false);
    try {
      window.open(await lawyerPdfUrl(version.storagePath), '_blank', 'noopener');
    } catch {
      setFailed(true);
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('legal.page.lawyer_version', { date })}</p>
      {version.kind === 'text' ? (
        <article
          className="legal-document"
          lang={version.language}
          dir={version.language === 'he' ? 'rtl' : 'ltr'}
          // The studio's own text: raw HTML is escaped and links are checked (legal/render.ts).
          // Its studio details are live fields, filled from the current settings.
          dangerouslySetInnerHTML={{
            __html: renderLegalHtml(
              legal
                ? fillLiveDetails(version.content ?? '', studioRenderContext(legal, docId, version.language))
                : { markdown: version.content ?? '', missingLabels: [] },
            ),
          }}
        />
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-2 outline-offset-2"
            onClick={() => void openPdf()}
            disabled={opening}
          >
            {opening ? t('common.loading') : t('legal.page.lawyer_pdf_open', { name: version.fileName ?? 'PDF' })}
          </button>
          {failed && (
            <p role="alert" className="text-sm text-red-700">
              {t('legal.page.lawyer_pdf_error')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
